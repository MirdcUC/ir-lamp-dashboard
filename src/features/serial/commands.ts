import { BAUD_RATE_VALUES } from './constants';
import type { LampStatus } from './types';

/**
 * 「設定畫面」對應的 SET_SET 參數。
 *
 * README.txt 裡這個指令其實有兩種矛盾的參數列：開頭「架構總覽」段落是
 * `SET_SET(currentID,AL1,AL2,AT,TU,P,I,D,GAIN,INT,UNT,DP,M_A,SV)`（14 參數，含 M_A），
 * 後面「已確認」的詳細規格改成 `SET_SET(currentID,AL1,AL2,AT,TU,P,I,D,GAIN,INT,UNT,DP,SV)`
 * （13 參數，M_A 移到 SET_ADVANCED）。2026-08-14 實測：按文件「已確認」版本（13 參數）送出，
 * 韌體回 `SET_ERROR(SET,FORMAT)`——沒有 PARAM/CODE，是通用格式錯誤，判斷是參數數量對不上，
 * 代表實際跑的韌體還是吃舊的 14 參數格式，文件那句「M_A 已移除」還沒真的同步到韌體。
 * 因此 M_A 加回來了（見 commandText.setSet 的第三個參數），但這個判斷還沒完全定案，
 * 待這次改動實測確認後再拿掉這段說明。
 */
export interface SetSetParams {
  al1: number;        // 第一組警報設定值 -99~999
  al2: number;         // 第二組警報設定值 -99~999
  autoTune: number;    // AT，0=Controlling 1=Auto-tuning
  offset: number;       // TU，Auto-tuning 偏差 0~999
  p: number;
  i: number;
  d: number;
  gain: number;         // GAIN 0.0~9.9
  sensorType: number;   // INT，下拉選單索引（Pt/K/J/R/S/T/B/E/N/L）
  unit: number;         // UNT，下拉選單索引（℃/℉）
  decimal: number;      // DP，下拉選單索引（無小數/一位小數）
  sv: number;           // 設定溫度
}

/**
 * 「進階設定畫面」對應的 SET_ADVANCED 參數，順序見 README.txt：
 * SET_ADVANCED(currentID,newID,RS,BPS,BIT,M_A,NUN)
 *
 * 2026-08-14 實測過兩種參數數量：
 * - 7 參數（含 newID/RS/BPS/BIT，照現況原樣送回去、只改 M_A/NUN）：被拒絕，但錯誤是
 *   `SET_ERROR(PARAM:NUN,CODE:2)`——帶 PARAM/CODE 細節，代表指令本身有被韌體正確解析，
 *   只是 NUN 這個「值」被判定不合法，不是格式錯。
 * - 3 參數（只送 currentID/M_A/NUN）：被拒絕，錯誤是 `SET_ERROR(ADVANCED,FORMAT)`——沒有
 *   PARAM/CODE 細節的通用格式錯誤，代表參數數量不對，3 個是錯的。
 *
 * 兩相對照，7 參數（跟 README.txt 文件一致）才是韌體實際期待的格式；3 參數是根據韌體工程師
 * 口頭描述做的錯誤猜測，已經改回來。真正還沒解決的是 `NUN` 在這個情境下該送什麼值才會被接受
 * （見下方 `nUn` 欄位的說明與 CHANGELOG.md），跟參數數量無關。
 */
export interface SetAdvancedParams {
  newStation: number; // newID，設定站號 1~255
  commMode: number;   // RS，下拉選單索引（RTU/ASCII）
  baudRate: number;   // BPS，下拉選單索引（對應 BAUD_RATE_VALUES：9600/19200/38400）
  format: number;     // BIT，下拉選單索引（7O1/7E1/8N1/8O1/8E1/8N2）
  controlMode: number; // M_A，下拉選單索引（自動/手動）
  nUn: number;         // NUN，手動輸出 0~100；實際會被接受的值目前還沒確認，見上方說明與 CHANGELOG.md
}

/**
 * `newStation`/`commMode`/`baudRate`/`format` 這四項韌體工程師口頭表示執行期間無法變更，
 * 因此一律照這支燈管目前回報的值原樣送回去（不要求變更），不採用表單快照——見 `store.ts` 的
 * `writeAdvanced`。`AdvancedSettingsPage.vue` 也用同一份換算邏輯顯示這幾個唯讀欄位，兩邊不會
 * 算出不一致的結果。
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
 * 每個指令的位置參數名稱，跟 `commandText` 組字串的順序一一對應。
 * 只給 `describeCommand` 用來把送出的指令標註成看得懂的形式，不影響實際送出的內容。
 */
const COMMAND_FIELD_NAMES: Record<string, readonly string[]> = {
  SET_MAIN: ['currentID', 'ON_OFF'],
  SET_SET: ['currentID', 'AL1', 'AL2', 'AT', 'TU', 'P', 'I', 'D', 'GAIN', 'INT', 'UNT', 'DP', 'M_A', 'SV'],
  SET_ADVANCED: ['currentID', 'newID', 'RS', 'BPS', 'BIT', 'M_A', 'NUN'],
};

/**
 * 把 `SET_SET(1,50,50,...)` 這種送出的指令行標註成 `currentID=1, AL1=50, AL2=50, ...`，
 * 方便直接對照每個位置對應哪個欄位，不用另外開 PROTOCOL.md 數順序。
 * 認不出指令名稱、或參數數量跟 `COMMAND_FIELD_NAMES` 對不上時回傳 null。
 */
export function describeCommand(line: string): string | null {
  const match = line.trim().match(/^([A-Z_]+)\(([^)]*)\)$/);
  if (!match) return null;

  const [, cmd, argsText] = match;
  const names = COMMAND_FIELD_NAMES[cmd!];
  if (!names) return null;

  const values = (argsText ?? '').split(',');
  if (values.length !== names.length) return null;

  return names.map((name, idx) => `${name}=${values[idx]}`).join(', ');
}

/** PC → Arduino 的指令字串；格式見 README.txt（指令名稱後直接接括號、逗號分隔的位置參數） */
export const commandText = {
  // 第一個參數是設定站號（1~255），三個指令都用同一支溫控器目前的站號定址
  setMain: (station: number, on: boolean) => `SET_MAIN(${station},${on ? 0 : 1})`, // 控制器 ON:0 / OFF:1

  // controlMode（M_A）不是 SettingsPage.vue 表單管的欄位，由呼叫端（store.ts）從目前回報值帶入，
  // 見上面 SetSetParams 的說明——這欄位是不是真的要放這裡，還在等這次改動的實測結果
  setSet: (station: number, p: SetSetParams, controlMode: number) =>
    `SET_SET(${station},${p.al1},${p.al2},${p.autoTune},${p.offset},${p.p},${p.i},${p.d},${p.gain},${p.sensorType},${p.unit},${p.decimal},${controlMode},${p.sv})`,

  // 7 參數，跟 README.txt 一致；BPS 送的是實際 bps，不是下拉選單索引，跟 RS/BIT/M_A 不同，
  // 見 SetAdvancedParams 上方的說明（3 參數版本試過，被 SET_ERROR(ADVANCED,FORMAT) 拒絕）
  setAdvanced: (station: number, p: SetAdvancedParams) =>
    `SET_ADVANCED(${station},${p.newStation},${p.commMode},${BAUD_RATE_VALUES[p.baudRate] ?? BAUD_RATE_VALUES[0]},${p.format},${p.controlMode},${p.nUn})`,
};
