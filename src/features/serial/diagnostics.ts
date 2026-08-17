import { computed, ref, type Ref } from 'vue';
import { RAW_LINE_BUFFER } from './constants';

export interface RawLine {
  text: string;
  at: number;
  direction: 'rx' | 'tx';
  /** 只有 rx 才有意義：是否有 adapter 解得出資料。tx 一律 true，不用來算解析率 */
  parsed: boolean;
}

/**
 * 保留最近收到／送出的原始資料與解析結果。
 * 板子送來當天，格式不對與線沒插好在畫面上長得一模一樣，這裡是唯一能分辨的地方；
 * 把送出的指令也一起記下來，才看得出「這行回報／SET_ERROR 是回應哪一道指令」。
 */
export function createDiagnostics() {
  const lines: Ref<RawLine[]> = ref([]);
  const receivedCount = ref(0);
  const parsedCount = ref(0);
  const activeAdapter: Ref<string | null> = ref(null);

  const push = (line: RawLine) => {
    const next = [...lines.value, line];
    lines.value = next.length > RAW_LINE_BUFFER ? next.slice(-RAW_LINE_BUFFER) : next;
  };

  /** 收到一行時記錄；只有這個方向會計入解析率統計 */
  const record = (text: string, parsed: boolean, adapter: string | null) => {
    receivedCount.value += 1;
    if (parsed) parsedCount.value += 1;
    if (adapter) activeAdapter.value = adapter;

    push({ text, at: Date.now(), direction: 'rx', parsed });
  };

  /** 送出一道指令時記錄；不計入收到行數／解析率，純粹留給使用者對照用 */
  const recordSent = (text: string) => {
    push({ text, at: Date.now(), direction: 'tx', parsed: true });
  };

  return {
    lines,
    receivedCount,
    parsedCount,
    activeAdapter,
    parseRate: computed(() =>
      receivedCount.value === 0 ? null : parsedCount.value / receivedCount.value,
    ),
    record,
    recordSent,
    reset: () => {
      lines.value = [];
      receivedCount.value = 0;
      parsedCount.value = 0;
      activeAdapter.value = null;
    },
  };
}
