import { BAUD_RATE_VALUES } from './constants';
import type { LampStatus } from './types';

/**
 * v4 草案（韌體工程師 2026-08-17 提供的 `紅外線控制模組_畫面.pptx`，見
 * docs/DEVICE-CHECKLIST.md H 節，未經實機驗證）：`SV`/`M_A`/`NUN` 從原本的 `SET_SET`/
 * `SET_ADVANCED` 都收斂進 `SET_MAIN`，變成 Run/Stop 指令一併帶溫度設定值跟控制模式。
 * `SettingsPage.vue`「設定溫度」、`AdvancedSettingsPage.vue`「控制模式選擇」/`NUN` 這幾個
 * 欄位的輸入框位置不變，但實際送出的指令改成呼叫這裡——見 `store.ts` 的 `dispatchMain`。
 */
export interface SetMainParams {
  on: boolean;          // ON_OFF，commandText.setMain 內部轉換成協定的 0=ON/1=OFF
  sv: number;             // SV，設定溫度
  controlMode: number;   // M_A，0=AUTO 1=MANUAL
  nUn: number;             // NUN，手動輸出量 0~100
}

/**
 * 「感測器設定」對應的 SET_PARAMETER 參數（v4 草案，原 `SET_SET` 已改名，見 SetMainParams 上方
 * 說明）。`M_A`/`SV` 移去 `SET_MAIN` 了，這裡不再出現；新增 `SHT`（輸入修正）欄位。
 */
export interface SetParameterParams {
  sensorType: number;   // INT，下拉選單索引（Pt/K/J/R/S/T/B/E/N/L）
  unit: number;         // UNT，下拉選單索引（℃/℉）
  decimal: number;      // DP，下拉選單索引（無小數/一位小數）
  sht: number;           // SHT，輸入修正（感測器校正偏移量）-999~9999
  autoTune: number;      // AT，0=Controlling 1=Auto-tuning
  offset: number;        // TU，Auto-tuning 偏差 0~999
  p: number;
  i: number;
  d: number;
  gain: number;          // GAIN 0.0~9.9
  al1: number;           // 第一組警報設定值 -999~9999
  al2: number;           // 第二組警報設定值 -999~9999
}

/**
 * 「進階設定畫面」對應的 SET_ADVANCED 參數（v4 草案）：`newID,RS,BPS,BIT`，`M_A`/`NUN` 移去
 * `SET_MAIN` 了，不再出現於這個指令。
 */
export interface SetAdvancedParams {
  newStation: number; // newID，設定站號 1~255
  commMode: number;   // RS，下拉選單索引（RTU/ASCII）
  baudRate: number;   // BPS，下拉選單索引（對應 BAUD_RATE_VALUES：9600/19200/38400）
  format: number;     // BIT，下拉選單索引（7O1/7E1/8N1/8O1/8E1/8N2）
}

/**
 * 從這支燈管目前回報的值算出 `newStation`/`commMode`/`baudRate`/`format` 的預設值，供
 * `AdvancedSettingsPage.vue` 切換分頁時預填表單——跟 `currentMainFields` 同一個套路，
 * 差別在這裡預填後使用者可以編輯再送出，不是原樣回填。
 */
export function lockedAdvancedFields(lamp: LampStatus | undefined, fallbackId: number) {
  return {
    newStation: lamp?.ID ?? fallbackId,
    commMode: lamp?.RS ?? 0,
    baudRate: Math.max(0, BAUD_RATE_VALUES.indexOf(lamp?.BPS as (typeof BAUD_RATE_VALUES)[number])),
    format: lamp?.BIT ?? 0,
  };
}

/**
 * `SET_MAIN` 現在同時帶 `ON_OFF`/`SV`/`M_A`/`NUN`，但畫面上這幾個欄位分散在不同頁面
 * （Run/Stop 按鈕、設定溫度、進階設定的控制模式/NUN），每次只有其中一兩項是使用者真的要改的。
 * 這裡從該燈管目前回報的值算出「維持不變」的其餘欄位，呼叫端只要 override 真正要改的那項——
 * 跟 `lockedAdvancedFields` 同一個套路。
 */
export function currentMainFields(lamp: LampStatus | undefined): SetMainParams {
  return {
    on: (lamp?.ON_OFF ?? 0) === 0,
    sv: lamp?.SV ?? 0,
    controlMode: lamp?.M_A ?? 0,
    nUn: lamp?.NUN ?? 0,
  };
}

/**
 * 每個指令的位置參數名稱，跟 `commandText` 組字串的順序一一對應。
 * 只給 `describeCommand` 用來把送出的指令標註成看得懂的形式，不影響實際送出的內容。
 * `SET_MAIN` 給陣列而不是單一組固定長度——AUTO 不帶 NUN 只有 4 個參數，MANUAL 才有 5 個。
 */
const COMMAND_FIELD_NAMES: Record<string, readonly (readonly string[])[]> = {
  SET_MAIN: [
    ['currentID', 'ON_OFF', 'SV', 'M_A'],
    ['currentID', 'ON_OFF', 'SV', 'M_A', 'NUN'],
  ],
  SET_PARAMETER: [['currentID', 'INT', 'UNT', 'DP', 'SHT', 'AT', 'TU', 'P', 'I', 'D', 'GAIN', 'AL1', 'AL2']],
  SET_ADVANCED: [['currentID', 'newID', 'RS', 'BPS', 'BIT']],
};

/**
 * 把 `SET_PARAMETER(1,1,0,0,0,0,0,6,120,30,1.0,50,50)` 這種送出的指令行標註成
 * `currentID=1, INT=1, ...`，方便直接對照每個位置對應哪個欄位，不用另外開 PROTOCOL.md 數順序。
 * 認不出指令名稱、或參數數量跟 `COMMAND_FIELD_NAMES` 對不上時回傳 null。
 */
export function describeCommand(line: string): string | null {
  const match = line.trim().match(/^([A-Z_]+)\(([^)]*)\)$/);
  if (!match) return null;

  const [, cmd, argsText] = match;
  const candidates = COMMAND_FIELD_NAMES[cmd!];
  if (!candidates) return null;

  const values = (argsText ?? '').split(',');
  const names = candidates.find((c) => c.length === values.length);
  if (!names) return null;

  return names.map((name, idx) => `${name}=${values[idx]}`).join(', ');
}

/** PC → Arduino 的指令字串；格式見 docs/PROTOCOL.md v4 草案（指令名稱後直接接括號、逗號分隔的位置參數） */
export const commandText = {
  // 第一個參數是設定站號（1~255），三個指令都用同一支溫控器目前的站號定址
  // AUTO（M_A=0）不帶 NUN，MANUAL（M_A=1）才帶——避免自動模式下 NUN 被當成格式/數值錯誤拒絕
  // （v3 的 SET_ADVANCED 有這問題，見 docs/DEVICE-CHECKLIST.md G7），2026-08-18 討論定案，待實機驗證
  setMain: (station: number, p: SetMainParams) =>
    p.controlMode === 0
      ? `SET_MAIN(${station},${p.on ? 0 : 1},${p.sv},${p.controlMode})` // 控制器 ON:0 / OFF:1
      : `SET_MAIN(${station},${p.on ? 0 : 1},${p.sv},${p.controlMode},${p.nUn})`,

  setParameter: (station: number, p: SetParameterParams) =>
    `SET_PARAMETER(${station},${p.sensorType},${p.unit},${p.decimal},${p.sht},${p.autoTune},${p.offset},${p.p},${p.i},${p.d},${p.gain},${p.al1},${p.al2})`,

  // 5 參數（拿掉 v3 的 M_A/NUN，見 SetAdvancedParams 上方說明）；BPS 送的是實際 bps，不是下拉選單索引
  setAdvanced: (station: number, p: SetAdvancedParams) =>
    `SET_ADVANCED(${station},${p.newStation},${p.commMode},${BAUD_RATE_VALUES[p.baudRate] ?? BAUD_RATE_VALUES[0]},${p.format})`,
};
