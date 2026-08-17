import { BAUD_RATE_VALUES, LAMP_FIELD_KEYS, LAMP_IDS, SV_DEFAULT } from './constants';
import { ALARM_BITS, STATUS_BITS } from './alarmStatus';
import type { SetAdvancedParams, SetMainParams, SetParameterParams } from './commands';

export interface SimulatorOptions {
  /** 模擬器產生的一行資料，與實機走同一條解析路徑 */
  onLine: (line: string) => void;
  onNotice: (type: 'info' | 'success', message: string) => void;
}

interface SimLamp {
  pv: number;
  sv: number;
  out: number;
  run: number;            // 1=ON 0=OFF，跟協定 ON_OFF（0=ON/1=OFF）方向相反，emit 時再轉換
  mode: 'auto' | 'manual'; // manual = 使用者手動指定輸出 %（M_A）
  outSet: number;          // 手動模式的輸出設定值（NUN）
  atTicks: number;         // AT 調諧剩餘秒數，0 = 未調諧；SET_PARAMETER 寫入 AT:1 時觸發
  pid: { p: number; i: number; d: number };
  heatGain: number;        // 每支燈管加熱特性略不同，曲線才會分開

  // 以下欄位只由 SET_PARAMETER/SET_ADVANCED 寫入並原樣回報，模擬器不會拿它們去影響物理曲線
  station: number;         // 進階設定的站號，決定回報行的 ID 欄位（見 lampState.ts 站號表）
  al1: number;
  al2: number;
  sensorType: number;      // INT
  unit: number;            // UNT
  decimal: number;         // DP
  sht: number;              // SHT（輸入修正），v4 新欄位
  offset: number;          // TU
  gain: number;             // GAIN
  commMode: number;        // RS
  baudRate: number;        // BPS（下拉索引，emit 時換算成實際 bps）
  format: number;           // BIT
}

const SIM_AMBIENT = 25;      // 環境溫度
const SIM_AT_SECONDS = 20;   // AT 調諧持續秒數

/**
 * 組出 parenField23Adapter 看得懂的一行；PV/SV/UN/AT/P/I/D 取自實際物理模擬，
 * 其餘設定類欄位（AL1/AL2/INT/UNT/DP/SHT/TU/GAIN/RS/BPS/BIT/M_A/NUN/ID）
 * 原樣回報 SET_MAIN/SET_PARAMETER/SET_ADVANCED 最後一次寫入的值，本身不影響物理曲線。
 */
function buildFields(s: SimLamp): Record<string, string> {
  const overheat = s.pv > s.sv + 3;

  let status = 0;
  if (s.out > 0) status |= STATUS_BITS.OUT1;
  if (overheat) status |= STATUS_BITS.AL1;

  // 只模擬「過熱」這一種異常；AL1/AL2 實際警報邏輯依 ALT 模式，尚未確認，見 README.txt 第 2、3 項
  const alarm = overheat ? ALARM_BITS.HtEr : 0;

  return {
    NUN: String(s.mode === 'manual' ? s.outSet : 0),
    AL1: String(s.al1),
    AL2: String(s.al2),
    AT: s.atTicks > 0 ? '1' : '0',
    TU: String(s.offset),
    P: s.pid.p.toFixed(1),
    I: String(s.pid.i),
    D: String(s.pid.d),
    GAIN: s.gain.toFixed(1),
    INT: String(s.sensorType),
    UNT: String(s.unit),
    DP: String(s.decimal),
    SHT: String(s.sht),
    ID: String(s.station), // 站號可能被 SET_ADVANCED 改掉，要回報目前站號才能讓 lampState 的站號表對得上
    RS: String(s.commMode),
    BPS: String(BAUD_RATE_VALUES[s.baudRate] ?? 9600),
    BIT: String(s.format),
    ON_OFF: s.run === 1 ? '0' : '1', // 協定 ON:0/OFF:1，跟 SimLamp.run（1=運轉）方向相反
    M_A: String(s.mode === 'manual' ? 1 : 0),
    SV: s.sv.toFixed(1),
    PV: s.pv.toFixed(1),
    UN: s.out.toFixed(0),
    STATUS: String(status),
    ALARM: String(alarm),
  };
}

function encodeLine(fields: Record<string, string>): string {
  return '(' + LAMP_FIELD_KEYS.map(key => `${key}:${fields[key]}`).join(',') + ')';
}

/** 無硬體時假裝成一塊 Arduino：吐出與實機相同格式的文字行 */
export function createSimulator(options: SimulatorOptions) {
  const state: Record<number, SimLamp> = {};
  let timer: ReturnType<typeof setInterval> | null = null;

  /**
   * `SET_OK`/`SET_ERROR` 回覆跟狀態行一樣走 `options.onLine`，但要延後到下一個 tick 才送出——
   * store.ts 送指令時是先呼叫這裡（同步執行完）才登記 pending 狀態（見 store.ts 的 dispatch/
   * tracker.start 順序），真實硬體因為要走 RS-485 一問一答，回覆一定比 JS 呼叫堆疊晚很多，
   * 這裡用 setTimeout(0) 模擬同樣的「後到」順序，否則 tracker 會收到「還沒登記過的指令」的回覆。
   */
  const emitResult = (line: string) => {
    setTimeout(() => options.onLine(line), 0);
  };

  const tick = (id: number, s: SimLamp) => {
    if (s.run !== 1) {
      s.out = 0;
      s.atTicks = 0;
      s.pv += (SIM_AMBIENT - s.pv) * 0.02 + (Math.random() - 0.5) * 0.2;
    } else if (s.atTicks > 0) {
      // AT 用繼電器式振盪（過 SV 關、低於 SV 全開）逼近極限週期
      s.atTicks--;
      s.out = s.pv < s.sv ? 100 : 0;
      const target = SIM_AMBIENT + s.out * 1.2 * s.heatGain;
      s.pv += (target - s.pv) * 0.06 + (Math.random() - 0.5) * 0.3;
      if (s.atTicks === 0) {
        // 調諧完成：給一組看起來像重算過的 PID
        s.pid = {
          p: Math.round((4 + Math.random() * 3) * 10) / 10,
          i: Math.round(100 + Math.random() * 60),
          d: Math.round(20 + Math.random() * 20),
        };
        options.onNotice('success', `燈管 ${id} AT 調諧完成`);
      }
    } else {
      if (s.mode === 'manual') {
        s.out = s.outSet;
      } else {
        // 粗略模擬 PID：離目標越遠輸出越大
        s.out = Math.min(100, Math.max(0, (s.sv - s.pv) * 8));
      }
      const target = SIM_AMBIENT + s.out * 1.2 * s.heatGain;
      s.pv += (target - s.pv) * 0.06 + (Math.random() - 0.5) * 0.3;
    }

    options.onLine(encodeLine(buildFields(s)));
  };

  const start = (autoRun: boolean) => {
    if (timer) return false;

    // 加熱特性刻意做出差異，趨勢圖四條曲線才不會疊在一起
    const heatGains = [1.0, 0.93, 1.06, 0.87];
    LAMP_IDS.forEach((id, idx) => {
      state[id] = {
        pv: SIM_AMBIENT + Math.random() * 3,
        sv: SV_DEFAULT,
        out: 0,
        run: autoRun ? 1 : 0,
        mode: 'auto',
        outSet: 0,
        atTicks: 0,
        pid: { p: 5.0, i: 120, d: 30 },
        heatGain: heatGains[idx] ?? 1.0,
        station: id,
        al1: 50,
        al2: 50,
        sensorType: 0,
        unit: 0,
        decimal: 0,
        sht: 0,
        offset: 0,
        gain: 1.0,
        commMode: 0,
        baudRate: 0,
        format: 2, // 8N1，對齊 README.txt 範例（BIT:2）
      };
    });

    timer = setInterval(() => {
      for (const id of LAMP_IDS) {
        const s = state[id];
        if (s) tick(id, s);
      }
    }, 1000);
    return true;
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  /**
   * v4 草案（見 commands.ts 的 SetMainParams 說明）：SET_MAIN 現在同時帶 ON_OFF/SV/M_A/NUN，
   * 涵蓋 Run/Stop 按鈕、設定溫度、進階設定的控制模式/NUN 三種畫面動作。
   */
  const setMain = (id: number, params: SetMainParams) => {
    const s = state[id];
    if (!s) return;
    s.run = params.on ? 1 : 0;
    s.sv = params.sv;
    s.mode = params.controlMode === 1 ? 'manual' : 'auto';
    s.outSet = params.nUn;
    emitResult(`SET_OK(MAIN,ID:${s.station})`);
  };

  // SET_PARAMETER 寫入的欄位：AT 會影響物理曲線（觸發 AT 調諧），其餘只記錄下來原樣回報
  const setParameter = (id: number, params: SetParameterParams) => {
    const s = state[id];
    if (!s) return;
    s.al1 = params.al1;
    s.al2 = params.al2;
    s.offset = params.offset;
    s.pid = { p: params.p, i: params.i, d: params.d };
    s.gain = params.gain;
    s.sensorType = params.sensorType;
    s.unit = params.unit;
    s.decimal = params.decimal;
    s.sht = params.sht;

    const wantAt = params.autoTune === 1;
    if (wantAt && s.atTicks === 0) {
      s.atTicks = SIM_AT_SECONDS;
      options.onNotice('info', `燈管 ${id} 開始 AT 調諧（約 ${SIM_AT_SECONDS} 秒）`);
    } else if (!wantAt) {
      s.atTicks = 0;
    }

    options.onNotice('info', `（模擬）燈管 ${id} 已送出 SET_PARAMETER`);
    emitResult(`SET_OK(PARAMETER,ID:${s.station})`);
  };

  // SET_ADVANCED 寫入的欄位：v4 草案只剩 newStation/RS/BPS/BIT，這幾項依 README.txt 的安全設計
  // 會被實機韌體拒絕，模擬器仍原樣接受並回報，方便畫面端練 UI
  const setAdvanced = (id: number, params: SetAdvancedParams) => {
    const s = state[id];
    if (!s) return;

    s.station = params.newStation;
    s.commMode = params.commMode;
    s.baudRate = params.baudRate;
    s.format = params.format;
    options.onNotice('info', `（模擬）燈管 ${id} 已送出 SET_ADVANCED`);
    emitResult(`SET_OK(ADVANCED,ID:${s.station})`); // 用新站號回覆，跟舊站號送出的指令用 currentID 定址一致
  };

  return { start, stop, setMain, setParameter, setAdvanced };
}
