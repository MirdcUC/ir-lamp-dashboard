/**
 * 單支燈管（NT-48L-RS）回報的即時狀態，null 代表尚未收到資料。
 * 欄位名稱與範圍照 README.txt / NT48L_RS_23項通訊欄位規格表.xlsx 的 23 項定義，
 * 已由 2026-08-14 收到的實機資料（見 CHANGELOG.md）逐欄位核對過，取代先前依
 * 產線/紅外線控制模組_畫面.md 猜測的格式（該文件已標記為過期，見文件開頭附註）。
 */
export interface LampStatus {
  NUN: number | null;    // 手動輸出量 0~100（自動模式下也會回報，不是 -1）
  AL1: number | null;    // 第一組警報設定值，-99~999，實際門檻語意依 ALT 模式
  AL2: number | null;    // 第二組警報設定值，-99~999
  AT: number | null;     // 0=Controlling 1=Auto-tuning
  TU: number | null;     // Auto-tuning 偏差，0~999
  P: number | null;      // 比例帶 0~999
  I: number | null;      // 積分時間 0~3999 秒
  D: number | null;      // 微分時間 0~3999 秒
  GAIN: number | null;   // 輸出控制增益 0.0~9.9
  INT: number | null;    // 感測器輸入類型，索引編碼（Pt/K/J/R/S/T/B/E/N/L）
  UNT: number | null;    // 溫度單位，索引編碼（℃/℉）
  DP: number | null;     // 小數點設定，索引編碼（無小數/一位小數）
  ID: number | null;     // 設定站號 1~255
  RS: number | null;     // 通訊模式，索引編碼（RTU/ASCII）
  BPS: number | null;    // RS-485 通訊速度（實際 bps：9600/19200/38400）
  BIT: number | null;    // RS-485 資料格式，索引編碼（7O1/7E1/8N1/8O1/8E1/8N2）
  ON_OFF: number | null; // 控制器啟停：0=ON 1=OFF
  M_A: number | null;    // 自動／手動模式：0=AUTO 1=MANUAL
  SV: number | null;     // 設定值，依 UNT/DP 解讀
  PV: number | null;     // 目前製程值（Read Only），依 UNT/DP 解讀
  UN: number | null;     // 目前實際輸出量 0~100%（Read Only）
  STATUS: number | null; // Bit Mask（Read Only）：0x1=OUT1 0x2=OUT2 0x4=AL1 0x8=AL2，見 statusBits.ts
  ALARM: number | null;  // Bit Mask（Read Only）：0x1=FFF 0x2=--- 0x4=HtEr 0x8=OhEr，見 statusBits.ts
}

/**
 * 單支燈管的資料新鮮度。
 * offline 代表「沒有在收到這支的資料」，不代表溫控器已停止加熱 —— 兩者要分開看。
 */
export type LampConnection = 'online' | 'stale' | 'offline';
