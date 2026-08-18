import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import { BAUD_RATE, LAMP_IDS } from './constants';
import {
  commandText,
  currentMainFields,
  type SetMainParams,
  type SetParameterParams,
  type SetAdvancedParams,
} from './commands';
import { createCommandTracker } from './commandTracker';
import { createDiagnostics } from './diagnostics';
import { createLampState } from './lampState';
import { createProtocolDecoder } from './protocol';
import { parseSetResult } from './protocol/setResult';
import { SerialCancelledError, SerialUnsupportedError, createSerialConnection } from './connection';
import { createSimulator } from './simulator';

export { LAMP_IDS };

export const useSerialStore = defineStore('serial', () => {
  const port: Ref<any> = ref(null); // SerialPort 物件
  const isConnected = ref(false);
  const isSimulating = ref(false);

  const state = createLampState();
  const decoder = createProtocolDecoder();
  const tracker = createCommandTracker();
  const diagnostics = createDiagnostics();

  /**
   * 實機與模擬共用的入口。`SET_OK`/`SET_ERROR` 回覆行跟 23 欄狀態行是兩種完全不同的格式
   * （見 protocol/setResult.ts），先試這個，比對不到才走原本的狀態行解析。
   */
  const handleLine = (line: string) => {
    const setResult = parseSetResult(line);
    if (setResult) {
      diagnostics.record(line, true, 'set-result');
      // SET_OK 帶的是站號，tracker 記錄用的是本地燈管 id，先查表轉換；查不到就放棄歸因
      const lampId = setResult.kind === 'ok' ? (state.getLampId(setResult.id) ?? null) : null;
      tracker.applyResult(lampId, setResult, Date.now());
      return;
    }

    const result = decoder.decode(line);
    diagnostics.record(line, result.frames.length > 0, result.adapter);
    state.applyFrames(result.frames);
    tracker.verify(state.lamps.value, Date.now());
  };

  // 資料新鮮度與指令逾時都要隨時間推進，共用同一個計時器
  let clock: ReturnType<typeof setInterval> | null = null;
  const startClock = () => {
    if (clock) return;
    clock = setInterval(() => {
      const timestamp = Date.now();
      state.tick(timestamp);
      tracker.tick(timestamp);
    }, 1000);
  };
  const stopClock = () => {
    if (!clock) return;
    clearInterval(clock);
    clock = null;
  };

  const connection = createSerialConnection({
    baudRate: BAUD_RATE,
    onLine: handleLine,
    onUnplugged: () => {
      isConnected.value = false;
      ElMessage.warning('串口設備已拔除');
    },
  });

  const simulator = createSimulator({
    onLine: handleLine,
    onNotice: (type, message) => ElMessage[type](message),
  });

  /** 連線 */
  const connect = async () => {
    if (isSimulating.value) {
      stopSimulation();
    }

    try {
      decoder.reset(); // 換資料來源就重新偵測格式
      await connection.open();
      port.value = connection.port;
      isConnected.value = true;
      startClock();
      ElMessage.success('接口連線成功');
    } catch (err) {
      if (err instanceof SerialUnsupportedError) {
        ElMessage.warning(err.message);
        return;
      }
      if (err instanceof SerialCancelledError) return; // 使用者取消選擇，不是錯誤
      console.error('連線失敗:', err);
      ElMessage.error('❌ 連線失敗');
    }
  };

  /** 斷開連線 */
  const disconnect = async () => {
    try {
      await connection.close();
      isConnected.value = false;
      ElMessage.success('接口連線已中斷');
    } catch (err) {
      console.error('❌ 斷線錯誤:', err);
    } finally {
      port.value = null;
      stopClock();
      state.resetStatus();
      tracker.reset();
      decoder.reset();
      diagnostics.reset();
    }
  };

  /**
   * 送出一道指令；模擬模式改由模擬器執行。回傳是否成功送出。
   * 實際會送出去才記進診斷面板（`diagnostics.recordSent`）——「尚未連線」被擋下來的不算，
   * 免得使用者看到一行送出紀錄卻找不到對應的回覆，以為裝置沒回應。
   */
  const dispatch = async (cmd: string, runSimulated: () => void): Promise<boolean> => {
    if (isSimulating.value) {
      diagnostics.recordSent(cmd);
      runSimulated();
      return true;
    }
    if (!isConnected.value) {
      ElMessage.warning('尚未連線');
      return false;
    }

    diagnostics.recordSent(cmd);
    try {
      await connection.write(cmd);
      return true;
    } catch (err) {
      console.error('寫入失敗:', err);
      ElMessage.error('❌ 串口寫入失敗，請重新連線');
      return false;
    }
  };

  /**
   * offline 不擋指令送出，但要讓使用者立刻知道「這道指令當下很可能沒有聽眾」，
   * 不用等 5 秒逾時才提醒——結論見待辦「offline 時是否禁止下控制命令」。
   */
  const isOffline = (id: number) => state.connections.value[id] === 'offline';

  /**
   * v4 草案（見 commands.ts 的 SetMainParams 說明，未經實機驗證）：`SET_MAIN` 同時帶
   * `ON_OFF`/`SV`/`M_A`/`NUN`，Run/Stop 按鈕、設定溫度、進階設定的控制模式/NUN 三種畫面動作
   * 最後都送這一道指令，只 override 真正要改的欄位，其餘照這支燈管目前回報的值原樣帶入
   * （`currentMainFields`），避免不小心把使用者沒有要改的欄位一併改掉。
   */
  const dispatchMain = async (id: number, overrides: Partial<SetMainParams>, requestedText: string) => {
    const offline = isOffline(id);
    const station = state.getStation(id);
    const outgoing: SetMainParams = { ...currentMainFields(state.lamps.value[id]), ...overrides };

    const sent = await dispatch(commandText.setMain(station, outgoing), () => simulator.setMain(id, outgoing));
    if (sent) {
      const expected = [outgoing.on ? 0 : 1, outgoing.sv, outgoing.controlMode, outgoing.nUn];
      tracker.start(id, 'main', expected, requestedText, Date.now(), offline);
    }
  };

  /** Run/Stop 控制。期望值用協定的 ON_OFF 編碼（0=ON/1=OFF），跟 commandText.setMain 送出的方向一致 */
  const setRun = (id: number, on: boolean) => dispatchMain(id, { on }, on ? '運轉' : '停止');

  /**
   * 寫入設定溫度/控制模式/手動輸出量（主畫面即時狀態面板，`LampDetailPanel.vue`）。
   * pptx slide 1 的 (2)(3)(4) 三項明確畫在主畫面，不是設定畫面/進階設定畫面，見
   * `docs/DEVICE-CHECKLIST.md` H 節。自動模式下 `commandText.setMain` 直接不帶 `NUN`（2026-08-18
   * 討論定案，待實機驗證是否避開 v3「自動模式送 NUN 被拒絕」的問題，見 G7/H1），手動模式下送
   * 表單輸入的實際值——呼叫端（`LampDetailPanel.vue`）負責換算。
   */
  const writeMain = (id: number, overrides: Partial<Pick<SetMainParams, 'sv' | 'controlMode' | 'nUn'>>) =>
    dispatchMain(id, overrides, 'SET_MAIN');

  /**
   * 寫入感測器/警報/PID/輸入修正設定（設定畫面的 SET_PARAMETER）；比對回報的對應欄位。
   * `SV`/`M_A`/`NUN` 不在這裡了，見上方 `writeMain`。
   */
  const writeParameter = async (id: number, params: SetParameterParams) => {
    const offline = isOffline(id);
    const station = state.getStation(id);

    const sent = await dispatch(
      commandText.setParameter(station, params),
      () => simulator.setParameter(id, params),
    );
    if (sent) {
      const expected = [
        params.sensorType, params.unit, params.decimal, params.sht,
        params.autoTune, params.offset, params.p, params.i,
        params.d, params.gain, params.al1, params.al2,
      ];
      tracker.start(id, 'setParameter', expected, 'SET_PARAMETER', Date.now(), offline);
    }
  };

  /**
   * 寫入通訊設定（進階設定畫面）。`SET_ADVANCED` v4 草案只剩
   * `newStation`/`commMode`/`baudRate`/`format`（見 commands.ts 的 SetAdvancedParams 說明）。
   * `controlMode`（M_A）/`nUn` 移去 `SET_MAIN` 了（見上方 `writeMain`），這裡不再收這兩個參數。
   */
  const writeAdvanced = async (id: number, params: SetAdvancedParams) => {
    const offline = isOffline(id);
    const station = state.getStation(id);

    const sent = await dispatch(commandText.setAdvanced(station, params), () => simulator.setAdvanced(id, params));
    // expected 傳非空陣列只是為了讓這筆進入 pending（reportedValues('setAdvanced') 恆回傳 null，
    // 這裡的值不會真的被拿去比對）——目的是讓 SET_OK/SET_ERROR 回覆行能透過 applyResult 生效；
    // 傳空陣列的話會直接變成不可驗證的 sent，之後就算韌體真的回了 SET_OK/SET_ERROR 也不會處理，
    // 見 commandTracker.ts 的 start()/applyResult()。
    if (sent) {
      const expected = [params.newStation, params.commMode, params.baudRate, params.format];
      tracker.start(id, 'setAdvanced', expected, 'SET_ADVANCED', Date.now(), offline);
    }
  };

  /** 啟動模擬；autoRun=true 時四支燈管直接開始加熱（?mock=1 用） */
  const startSimulation = (autoRun = false) => {
    if (isConnected.value) {
      ElMessage.warning('已連線實際裝置，請先斷線再啟動模擬');
      return;
    }
    decoder.reset();
    if (!simulator.start(autoRun)) return;

    isSimulating.value = true;
    startClock();
    ElMessage.success(autoRun ? '模擬模式已啟動（四支燈管自動運轉）' : '模擬模式已啟動');
  };

  const stopSimulation = () => {
    simulator.stop();
    isSimulating.value = false;
    stopClock();
    state.resetStatus();
    tracker.reset();
    decoder.reset();
    diagnostics.reset();
  };

  return {
    port,
    isConnected,
    isSimulating,
    lamps: state.lamps,
    connections: state.connections,
    rawLines: diagnostics.lines,
    activeAdapter: diagnostics.activeAdapter,
    receivedCount: diagnostics.receivedCount,
    parsedCount: diagnostics.parsedCount,
    parseRate: diagnostics.parseRate,
    staleness: state.staleness,
    commands: tracker.commands,
    getStation: state.getStation,
    connect,
    disconnect,
    setRun,
    writeMain,
    writeParameter,
    writeAdvanced,
    startSimulation,
    stopSimulation,
  };
});
