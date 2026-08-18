import { LAMP_FIELD_KEYS } from '../constants';
import type { ProtocolAdapter } from './types';

/** 把 `a:1,b:2` 這種逗號分隔的 key:value 行拆成字典 */
function splitPairs(line: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const pair of line.split(',')) {
    const [key, val] = pair.split(':').map(v => v.trim());
    if (key && val !== undefined) pairs[key] = val;
  }
  return pairs;
}

/** 只收 `keys` 定義過的欄位，其餘忽略 */
function pickFields(pairs: Record<string, string>, keys: readonly string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const key of keys) {
    const val = pairs[key];
    if (val !== undefined) fields[key] = val;
  }
  return fields;
}

/**
 * 韌體工程師確認的最終格式（README.txt / NT48L_RS_23項通訊欄位規格表.xlsx，2026-08-14 以實機
 * 資料核對過，見 CHANGELOG.md）：整行用括號包住，帶齊 23 項欄位，含設定站號 `ID`。
 *
 * 實機一行長這樣：
 * `(NUN:0,AL1:50,AL2:50,AT:0,TU:0,P:6,I:120,D:30,GAIN:1.0,INT:1,UNT:0,DP:0,ID:1,RS:0,BPS:9600,BIT:2,ON_OFF:0,M_A:0,SV:0,PV:29,UN:0,STATUS:0,ALARM:0)`
 *
 * `ID` 是設定站號（1~255），不一定等於 PC 端本地燈管 id（1~4）——兩者的對照由 `lampState.ts`
 * 的站號表負責，這裡只做最基本的格式檢查，不把 `ID` 限制在 `LAMP_IDS`。
 *
 * v4 草案（見 docs/DEVICE-CHECKLIST.md H 節，未經實機驗證）多了 `SHT` 欄位，變成 24 項。因為
 * 這裡是 key:value 逗號分隔格式、`pickFields` 只挑 `LAMP_FIELD_KEYS` 裡有的 key，不管順序、
 * 也不要求每個 key 都出現，所以同一個 adapter 可以同時吃 v3（沒有 SHT）跟 v4（有 SHT）的行，
 * 不用另外開一個 adapter。
 */
export const parenField23Adapter: ProtocolAdapter = {
  name: 'paren-field23',
  label: '括號包住的 23 欄位（(NUN:0,...,ID:1,...,ALARM:0)）',

  match(line) {
    const trimmed = line.trim();
    // 只做最基本的框線檢查；欄位是否含 ID、能不能解出站號交給 parse() 判斷（見下方，避免
    // parens 黏在第一個 key 上時，例如 "(ID:1,...)"，被誤判成沒有 ID 欄位）。
    return trimmed.startsWith('(') && trimmed.endsWith(')');
  },

  parse(line) {
    const trimmed = line.trim().slice(1, -1); // 拿掉外層括號
    const pairs = splitPairs(trimmed);
    const id = Number(pairs['ID']);
    if (!Number.isInteger(id) || id <= 0) return [];

    const fields = pickFields(pairs, LAMP_FIELD_KEYS);
    return Object.keys(fields).length > 0 ? [{ id, fields }] : [];
  },
};

/** 自動偵測時嘗試的 adapter 清單；目前只有一種已確認格式 */
export const ALL_ADAPTERS: ProtocolAdapter[] = [parenField23Adapter];
