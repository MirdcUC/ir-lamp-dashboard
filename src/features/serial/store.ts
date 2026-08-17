import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import { BAUD_RATE, LAMP_IDS } from './constants';
import { commandText, lockedAdvancedFields, type SetSetParams, type SetAdvancedParams } from './commands';
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
   * Run/Stop 控制（SET_MAIN）。第一個參數是設定站號，用 `state` 的站號表把本地燈管 id
   * 轉成該卡片目前的站號再送出（預設站號=id，只有進階設定改過站號後才會不同）。
   * 期望值用協定的 ON_OFF 編碼（0=ON/1=OFF），跟 commandText.setMain 送出的方向一致。
   */
  const setRun = async (id: number, on: boolean) => {
    const offline = isOffline(id);
    const station = state.getStation(id);
    const sent = await dispatch(commandText.setMain(station, on), () => simulator.setRun(id, on));
    if (sent) tracker.start(id, 'run', [on ? 0 : 1], on ? '運轉' : '停止', Date.now(), offline);
  };

  /**
   * 寫入感測器/警報/PID 設定（設定畫面的 SET_SET）；比對回報的對應欄位。
   * `controlMode`（M_A）不是這個畫面管的欄位，直接照這支燈管目前回報的值原樣送回去，
   * 不改變自動/手動模式——見 commands.ts 的 SetSetParams 說明，這個欄位是不是真的要出現在
   * SET_SET 還在實測中。
   */
  const writeSet = async (id: number, params: SetSetParams) => {
    const offline = isOffline(id);
    const station = state.getStation(id);
    const controlMode = state.lamps.value[id]?.M_A ?? 0;
    const sent = await dispatch(
      commandText.setSet(station, params, controlMode),
      () => simulator.setSet(id, params),
    );
    if (sent) {
      const expected = [
        params.al1, params.al2, params.autoTune, params.offset,
        params.p, params.i, params.d, params.gain,
        params.sensorType, params.unit, params.decimal, controlMode, params.sv,
      ];
      tracker.start(id, 'setSet', expected, 'SET_SET', Date.now(), offline);
    }
  };

  /**
   * 寫入控制模式設定（進階設定畫面的 SET_ADVANCED）；比對回報的對應欄位。指令用 7 參數的完整
   * 格式（跟 README.txt 一致）——3 參數版本試過，被韌體回 `SET_ERROR(ADVANCED,FORMAT)`
   * 整道拒絕，證實參數數量錯了，見 commands.ts 的 SetAdvancedParams 說明。
   *
   * `newStation`/`commMode`/`baudRate`/`format` 這四項不採用 `params` 裡的值（那是表單快照，
   * 可能過期），改用 `lockedAdvancedFields` 直接從這支燈管目前回報的值算——保證每次送出去的
   * 都是「維持不變」。`AdvancedSettingsPage.vue` 也用同一個函式來源顯示這幾個唯讀欄位。
   *
   * `NUN` 該送什麼值才會被接受目前不穩定——2026-08-14 同樣送 `-1`，曾經 `SET_OK`，也曾經被
   * `SET_ERROR(PARAM:NUN,CODE:2)` 拒絕，原因還沒查出來，見 CHANGELOG.md。自動模式下沿用畫面.md
   * 舊版規則固定送 `-1`；手動模式下送表單輸入的實際值，兩種都不保證一定會成功，UI 端已提醒
   * 使用者要對照連線診斷確認結果。
   */
  const writeAdvanced = async (id: number, params: Pick<SetAdvancedParams, 'controlMode' | 'nUn'>) => {
    const offline = isOffline(id);
    const station = state.getStation(id);
    const isManual = params.controlMode === 1;
    const locked = lockedAdvancedFields(state.lamps.value[id], id);
    const outgoing: SetAdvancedParams = {
      ...locked,
      controlMode: params.controlMode,
      nUn: isManual ? params.nUn : -1,
    };

    const sent = await dispatch(commandText.setAdvanced(station, outgoing), () => simulator.setAdvanced(id, outgoing));
    if (sent) {
      const expected = [params.controlMode, ...(isManual ? [params.nUn] : [])];
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
    connect,
    disconnect,
    setRun,
    writeSet,
    writeAdvanced,
    startSimulation,
    stopSimulation,
  };
});
