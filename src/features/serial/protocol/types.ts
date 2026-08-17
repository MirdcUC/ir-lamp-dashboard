/** 從一行文字解析出的單台資料；欄位名已正規化成協定原始鍵名（pv/sv/out/run/at/alm1/alm2、p/i/d） */
export interface ParsedFrame {
  id: number;
  fields: Record<string, string>;
}

/**
 * 一種 Arduino 回報格式的解析器。
 * 板子的實際格式在拿到之前無法確定，因此格式是可插拔的，新增一種只要多寫一個 adapter。
 */
export interface ProtocolAdapter {
  /** 內部識別名，會顯示在除錯資訊裡 */
  name: string;
  /** 給人看的說明 */
  label: string;
  /** 這行是否像本格式，供自動偵測用；不需精確，真正的判定以 parse 有無結果為準 */
  match(line: string): boolean;
  /** 解析一行，回傳 0~N 台的資料 */
  parse(line: string): ParsedFrame[];
}
