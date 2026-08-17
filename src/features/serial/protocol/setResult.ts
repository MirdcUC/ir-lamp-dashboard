/**
 * `SET_MAIN`/`SET_SET`/`SET_ADVANCED` 的回覆行，格式見 PROTOCOL.md：
 *   成功：SET_OK(MAIN,ID:1) / SET_OK(SET,ID:1) / SET_OK(ADVANCED,ID:1)
 *   錯誤：SET_ERROR(PARAM:SV,CODE:14,MIN:...,MAX:...) 或不帶參數細節的 SET_ERROR(...)
 *
 * 這跟 23 欄狀態回報是完全不同的兩種行，所以不走 `ProtocolAdapter`/`ParsedFrame` 那一套
 * （那套是「一行 = 一支燈管的欄位快照」，這裡是「一行 = 一道指令的執行結果」），用獨立的
 * 純函式解析，由 store.ts 的 handleLine 在 decoder 之前先試一次。
 */

export type SetResultCommand = 'MAIN' | 'SET' | 'ADVANCED';

export interface SetOkResult {
  kind: 'ok';
  command: SetResultCommand;
  /** 設定站號（回覆行裡的 ID，即這道指令定址用的 currentID），不是本地燈管 id */
  id: number;
}

export interface SetErrorResult {
  kind: 'error';
  /** 只有 `SET_ERROR(PARAM:...,CODE:...)` 這種帶細節的格式才有值 */
  param: string | null;
  code: number | null;
  min: number | null;
  max: number | null;
  /** 原始內容（不含 `SET_ERROR(` `)`），parseSetResult 抓不出結構時當作 fallback 顯示用 */
  raw: string;
}

export type SetResult = SetOkResult | SetErrorResult;

const OK_RE = /^SET_OK\((MAIN|SET|ADVANCED),ID:(\d+)\)$/;
const ERROR_PARAM_RE = /^SET_ERROR\(PARAM:([A-Za-z0-9_]+),CODE:(-?\d+)(?:,MIN:(-?[\d.]+),MAX:(-?[\d.]+))?\)$/;
const ERROR_RE = /^SET_ERROR\((.*)\)$/;

/** 不是這兩種回覆行就回傳 null，讓呼叫端退回原本的狀態行解析 */
export function parseSetResult(line: string): SetResult | null {
  const trimmed = line.trim();

  const ok = OK_RE.exec(trimmed);
  if (ok) {
    return { kind: 'ok', command: ok[1] as SetResultCommand, id: Number(ok[2]) };
  }

  const errorParam = ERROR_PARAM_RE.exec(trimmed);
  if (errorParam) {
    return {
      kind: 'error',
      param: errorParam[1]!,
      code: Number(errorParam[2]),
      min: errorParam[3] !== undefined ? Number(errorParam[3]) : null,
      max: errorParam[4] !== undefined ? Number(errorParam[4]) : null,
      raw: trimmed.slice('SET_ERROR('.length, -1),
    };
  }

  const error = ERROR_RE.exec(trimmed);
  if (error) {
    return { kind: 'error', param: null, code: null, min: null, max: null, raw: error[1]! };
  }

  return null;
}

/** 給人看的錯誤說明，UI（settingsShared.ts）直接用這個字串顯示 */
export function describeSetError(result: SetErrorResult): string {
  if (result.param !== null && result.code !== null) {
    const range = result.min !== null && result.max !== null ? `，範圍 ${result.min}~${result.max}` : '';
    return `韌體拒絕：${result.param} 不合法${range}（CODE:${result.code}）`;
  }
  return `韌體拒絕：${result.raw}`;
}
