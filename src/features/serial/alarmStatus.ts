/**
 * `STATUS` / `ALARM` 是 Bit Mask，可以同時有多個狀態成立，不能只用單一數值 switch 判斷，
 * 要逐位元 AND。
 *
 * `STATUS` 的 `AL1`/`AL2` 位元位置跟 README.txt / xlsx 文件寫的不一樣：文件說是 0x04/0x08
 * （bit 2/3），但 2026-08-14 實機核對發現真正的位置是 0x100/0x1000（bit 8/12），中間差一個
 * nibble——只亮 AL1 回報 `STATUS:256`，只亮 AL2 回報 `STATUS:4096`，兩個都亮是
 * `STATUS:4352`（=256+4096，還是單純的位元相加，只是位置不同），見 CHANGELOG.md。
 * `OUT1`/`OUT2` 這兩個位元還沒有實機資料驗證過，暫時維持文件寫的 0x01/0x02，之後要是也對不上
 * 再一併修正。
 */
export const STATUS_BITS = {
  OUT1: 0x0001,
  OUT2: 0x0002,
  AL1: 0x0100,
  AL2: 0x1000,
} as const;

export const ALARM_BITS = {
  FFF: 0x0001,
  DASH: 0x0002, // 面板顯示 "---"
  HtEr: 0x0004,
  OhEr: 0x0008,
} as const;

const ALARM_LABELS: Record<keyof typeof ALARM_BITS, string> = {
  FFF: 'FFF',
  DASH: '---',
  HtEr: 'HtEr',
  OhEr: 'OhEr',
};

/** value 是否含有 bit（value 為 null/undefined 一律回傳 false） */
export function hasBit(value: number | null | undefined, bit: number): boolean {
  return typeof value === 'number' && (value & bit) !== 0;
}

/** ALARM bitmask 轉成目前成立的異常代碼清單；沒有異常回傳空陣列 */
export function activeAlarmCodes(value: number | null | undefined): string[] {
  if (typeof value !== 'number') return [];
  return (Object.keys(ALARM_BITS) as (keyof typeof ALARM_BITS)[])
    .filter(key => hasBit(value, ALARM_BITS[key]))
    .map(key => ALARM_LABELS[key]);
}
