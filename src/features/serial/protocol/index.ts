import { ALL_ADAPTERS } from './adapters';
import type { ParsedFrame, ProtocolAdapter } from './types';

export type { ParsedFrame, ProtocolAdapter } from './types';
export { ALL_ADAPTERS, parenField23Adapter } from './adapters';

export interface DecodeResult {
  frames: ParsedFrame[];
  /** 解析本行所用的 adapter 名稱；null 代表沒有任何 adapter 解得出資料 */
  adapter: string | null;
}

/**
 * 逐行判定格式；目前只有一種已確認格式（`paren-field23`，見 adapters.ts），但解碼器仍保留
 * 「逐行嘗試 adapter 清單」的設計，之後如果韌體又改格式，只要新增一個 adapter 就好，不用動這裡。
 */
export function createProtocolDecoder(adapters: ProtocolAdapter[] = ALL_ADAPTERS) {
  let lastAdapter: ProtocolAdapter | null = null;

  const decode = (line: string): DecodeResult => {
    for (const adapter of adapters) {
      if (!adapter.match(line)) continue;
      const frames = adapter.parse(line);
      if (frames.length > 0) {
        lastAdapter = adapter;
        return { frames, adapter: adapter.name };
      }
    }
    return { frames: [], adapter: null };
  };

  return {
    decode,
    reset: () => {
      lastAdapter = null;
    },
    get activeAdapter(): string | null {
      return lastAdapter?.name ?? null;
    },
  };
}

export type ProtocolDecoder = ReturnType<typeof createProtocolDecoder>;
