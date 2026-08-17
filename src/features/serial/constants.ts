import type { LampStatus } from './types';
import { deepClone } from '@/shared/utils';

/** 燈管編號 1~4，協定中 id=0 代表廣播給全部 */
export const LAMP_IDS = [1, 2, 3, 4];

// ─────────────────────────────────────────────────────────
// 待現場確認的參數：板子到貨、製程條件定案後只改這一區，
// 全專案（含模擬器與假 Web Serial）都從這裡取值
// ─────────────────────────────────────────────────────────

// 序列埠參數需與 Arduino 韌體一致，詳見 PROTOCOL.md
export const BAUD_RATE = 9600;

/** SV 可輸入範圍；溫控器規格上限（999.9）不等於這條產線該有的溫度，待控制工程師確認 */
export const SV_MIN = 0;
export const SV_MAX = 150;

/** 開機預設的 SV 輸入值（製程目標溫度），待製程確認 */
export const SV_DEFAULT = 80;

/** SV 變更幅度超過這個值就要二次確認；日常微調不打擾，誤打一個 0 會被擋下 */
export const SV_CONFIRM_DELTA = 20;

/** 輸出 % 達到這個值視為接近滿載，bar graph 高段轉紅 */
export const OUT_HIGH_PERCENT = 80;

/** UNT 索引 → 顯示單位；0=℃、1=℉，見 PROTOCOL.md 第 11 項 */
export const TEMP_UNIT_LABELS = ['°C', '°F'] as const;

/** UNT 為 null（尚未收到資料）時預設顯示 °C */
export function tempUnitLabel(unt: number | null | undefined): string {
  return TEMP_UNIT_LABELS[unt ?? 0] ?? TEMP_UNIT_LABELS[0];
}

/**
 * 依 DP（0=無小數、1=一位小數，見 PROTOCOL.md 第 12 項）格式化 PV/SV 顯示。
 * value 為 null（尚未收到資料）時回傳跟小數位數對齊的佔位符。
 */
export function formatTempValue(value: number | null | undefined, dp: number | null | undefined): string {
  const decimals = dp === 1 ? 1 : 0;
  if (value === null || value === undefined) return decimals === 1 ? '---.-' : '---';
  return value.toFixed(decimals);
}

// ─────────────────────────────────────────────────────────

// Arduino 每秒回報一次，容許數次抖動後才判定異常
/** 超過這段時間沒收到該台資料，畫面上的值視為過期 */
export const STALE_AFTER_MS = 5000;
/** 超過這段時間沒收到該台資料，視為該台失聯 */
export const OFFLINE_AFTER_MS = 15000;

// 協定沒有 ACK，指令結果只能靠下一輪回報值比對，詳見 PROTOCOL.md
/** 指令送出後等待回報值變化的時間，逾時代表結果未知 */
export const COMMAND_TIMEOUT_MS = 5000;
/** 已完成的指令提示保留多久後自動消失；未確認的不自動消失 */
export const COMMAND_CLEAR_MS = 5000;
/** 回報值與要求值的比對容差 */
export const COMMAND_TOLERANCE = 0.1;

/** 除錯面板保留的原始資料行數 */
export const RAW_LINE_BUFFER = 50;

/**
 * `BPS`（通訊速度）下拉選單索引 → 實際 bps。
 * 跟 `RS`/`BIT`/`M_A` 不同，`BPS` 不論在回報行還是 SET_ADVANCED 指令裡都是「實際 bps」，
 * 不是暫存器索引——README.txt 的回報範例是 `BPS:9600`，指令範例是
 * `SET_ADVANCED(1,1,0,9600,2,0,0)`，兩邊的 BPS 位置都直接放 9600，不是 0。
 * UI 下拉選單仍用索引比較好操作，這裡集中做索引 ↔ 實際值的轉換，避免各處各轉一次、
 * 转法不一致（先前就是這樣才讓 SET_ADVANCED 的 read-back 永遠比對不到，見 CHANGELOG.md）。
 */
export const BAUD_RATE_VALUES = [9600, 19200, 38400] as const;

/**
 * 協定 23 項欄位名，供解析器判斷哪些 key 要收；順序照 README.txt / xlsx 原始順序。
 * 見 types.ts 的 LampStatus 逐欄位說明。
 */
export const LAMP_FIELD_KEYS = [
  'NUN', 'AL1', 'AL2', 'AT', 'TU', 'P', 'I', 'D', 'GAIN',
  'INT', 'UNT', 'DP', 'ID', 'RS', 'BPS', 'BIT',
  'ON_OFF', 'M_A', 'SV', 'PV', 'UN', 'STATUS', 'ALARM',
] as const;

export const initLampStatus: LampStatus = {
  NUN: null,
  AL1: null,
  AL2: null,
  AT: null,
  TU: null,
  P: null,
  I: null,
  D: null,
  GAIN: null,
  INT: null,
  UNT: null,
  DP: null,
  ID: null,
  RS: null,
  BPS: null,
  BIT: null,
  ON_OFF: null,
  M_A: null,
  SV: null,
  PV: null,
  UN: null,
  STATUS: null,
  ALARM: null,
};

export function buildLampMap<T>(init: T): Record<number, T> {
  const map: Record<number, T> = {};
  for (const id of LAMP_IDS) map[id] = deepClone(init);
  return map;
}
