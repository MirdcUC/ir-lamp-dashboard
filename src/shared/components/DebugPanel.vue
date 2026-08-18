<template>
  <el-card shadow="never" class="debug-panel mb-4">
    <template #header>
      <div class="flex items-center justify-between">
        <span class="font-bold">連線診斷 · 溫控器 {{ activeLampId }}</span>
        <div class="flex items-center gap-2">
          <el-button size="small" :type="paused ? 'warning' : undefined" @click="togglePause">
            {{ paused ? '繼續接收' : '暫停接收' }}
          </el-button>
          <el-button size="small" :disabled="displayLines.length === 0" @click="copyRaw">
            複製原始資料
          </el-button>
        </div>
      </div>
    </template>

    <div class="stats">
      <div class="stat">
        <span class="stat-label">判定格式</span>
        <span class="stat-value" :class="{ 'is-warn': !store.activeAdapter }">
          {{ adapterText }}
        </span>
      </div>
      <div class="stat">
        <span class="stat-label">收到行數</span>
        <span class="stat-value">{{ store.receivedCount }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">解析成功</span>
        <span class="stat-value">{{ store.parsedCount }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">成功率</span>
        <span class="stat-value" :class="{ 'is-warn': lowParseRate }">{{ rateText }}</span>
      </div>
    </div>

    <div v-if="store.receivedCount === 0" class="empty">
      尚未收到任何資料。若已連線仍是這樣，先確認 baud rate 與板子是否有主動回報。
    </div>
    <div v-else-if="lowParseRate" class="empty is-warn">
      收得到資料但解析不出來，代表格式與內建的 adapter 不符。把下方原始資料複製給韌體那邊比對。
    </div>
    <div v-if="paused" class="empty is-warn">
      已暫停顯示，畫面停在暫停當下那一批資料——底下仍持續收發，恢復接收後會直接跳到最新狀態
      <template v-if="pausedBehindCount > 0">（暫停期間又新增了 {{ pausedBehindCount }} 行）</template>。
    </div>

    <Transition name="tab-fade" mode="out-in">
      <div v-if="displayLines.length" :key="activeLampId" class="raw-list">
        <div
          v-for="(line, idx) in filteredLines"
          :key="idx"
          class="raw-line"
          :class="{
            'is-bad': line.direction === 'rx' && !line.parsed,
            'is-tx': line.direction === 'tx',
            'is-set-ok': isSetOk(line.text),
            'is-set-error': isSetError(line.text),
          }"
        >
          <span class="raw-time">{{ formatTime(line.at) }}</span>
          <span class="raw-dir">{{ line.direction === 'tx' ? '→' : '←' }}</span>
          <span class="raw-text">{{ line.text }}</span>
          <div v-if="line.direction === 'tx' && describeCommand(line.text)" class="raw-legend">
            {{ describeCommand(line.text) }}
          </div>
        </div>
        <div v-if="filteredLines.length === 0" class="empty">這台溫控器目前沒有原始資料。</div>
      </div>
    </Transition>
  </el-card>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useSerialStore } from '@/features/serial/store';
import { activeLampId } from '@/features/serial/activeLamp';
import type { RawLine } from '@/features/serial/diagnostics';
import { describeCommand } from '@/features/serial/commands';

const store = useSerialStore();

const adapterText = computed(() => store.activeAdapter ?? '尚未判定');

const rateText = computed(() =>
  store.parseRate === null ? '--' : `${(store.parseRate * 100).toFixed(0)} %`,
);

// 收到資料卻幾乎解不出來，通常代表板子的格式不是內建的那兩種
const lowParseRate = computed(
  () => store.receivedCount > 0 && store.parseRate !== null && store.parseRate < 0.5,
);

/**
 * 暫停只凍結「畫面顯示」，底下 store 還是照樣收發、繼續累積——不然暫停期間收到的東西
 * 就真的不見了。暫停當下拍一份快照，畫面一直看這份快照，直到按「繼續接收」才切回即時資料。
 */
const paused = ref(false);
const frozenLines = ref<RawLine[]>([]);
const displayLines = computed(() => (paused.value ? frozenLines.value : store.rawLines));
const pausedBehindCount = computed(() => Math.max(0, store.rawLines.length - frozenLines.value.length));

const togglePause = () => {
  if (paused.value) {
    paused.value = false;
    return;
  }
  frozenLines.value = [...store.rawLines];
  paused.value = true;
};

const reversedLines = computed(() => [...displayLines.value].reverse());

// SET_OK/SET_ERROR 回覆行標色用，跟 protocol/setResult.ts 的判斷方式一致（開頭比對就夠，
// 不需要真的解析出結構）
const isSetOk = (text: string) => text.trim().startsWith('SET_OK(');
const isSetError = (text: string) => text.trim().startsWith('SET_ERROR(');

// 收到的狀態行是 `id:1` 這種 key:value；送出的指令行是 `SET_SET(1,...)`，站號是括號內第一個
// 參數。兩種都直接從原始文字抓，不依賴解析結果，即使解析失敗也還是能照目前選取的燈管過濾
const extractId = (text: string) => {
  const kv = /(?:^|[,(])id\s*:\s*(\d+)/i.exec(text);
  if (kv) return kv[1]!;
  const cmd = /^[A-Z_]+\((\d+)/.exec(text.trim());
  return cmd ? cmd[1]! : null;
};

// 目前選取的卡片可能換過站號（見 lampState.ts 的路由表），要用「這張卡片目前的站號」比對，
// 不能直接拿本地 lamp id 跟原始資料裡的站號比
const activeStation = computed(() => String(store.getStation(activeLampId.value)));

// SET_ERROR 這類回覆行協定本身沒有帶站號（見 commandTracker.ts 的 applyResult 說明），
// extractId 一律解析成 null——這種「解不出站號」的行不該被篩掉，每個分頁都要看得到，
// 不然會出現「畫面上顯示被拒絕了，但 debug 原始資料完全看不到那一行」的落差
const filteredLines = computed(() =>
  reversedLines.value.filter(line => {
    const id = extractId(line.text);
    return id === null || id === activeStation.value;
  }),
);

const formatTime = (at: number) =>
  new Date(at).toLocaleTimeString('zh-TW', { hour12: false });

const copyRaw = async () => {
  const text = [...filteredLines.value].reverse().map(l => `${formatTime(l.at)}  ${l.text}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('原始資料已複製');
  } catch (err) {
    console.error('複製失敗:', err);
    ElMessage.error('❌ 複製失敗，請手動選取');
  }
};
</script>

<style scoped>
.debug-panel {
  border-left: 3px solid var(--hmi-text-dim);
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 0.6875rem;
  color: var(--hmi-text-dim);
}

.stat-value {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--hmi-text);
  font-variant-numeric: tabular-nums;
}

.stat-value.is-warn {
  color: var(--el-color-warning);
}

.empty {
  font-size: 0.75rem;
  color: var(--hmi-text-dim);
  margin-bottom: 8px;
}

.empty.is-warn {
  color: var(--el-color-warning);
  font-weight: 600;
}

.raw-list {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--hmi-panel-edge);
  border-radius: 4px;
  padding: 6px 8px;
  background: var(--hmi-window);
}

.raw-line {
  font-family: var(--hmi-digits);
  font-size: 0.75rem;
  line-height: 1.6;
  color: #a7afb8;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 解不出來的行標紅，一眼看出是格式問題還是沒資料 */
.raw-line.is-bad {
  color: var(--el-color-danger);
}

/* 送出的指令用強調色，跟收到的狀態行/回覆行分開，一眼看出方向 */
.raw-line.is-tx {
  color: var(--hmi-accent, #4ea8ff);
}

/* SET_OK/SET_ERROR 回覆行分別標成綠/紅，一眼看出指令有沒有被接受 */
.raw-line.is-set-ok {
  color: var(--hmi-led-green, var(--el-color-success));
  font-weight: 600;
}

.raw-line.is-set-error {
  color: var(--hmi-led-red, var(--el-color-danger));
  font-weight: 600;
}

.raw-time {
  color: #4a525b;
  margin-right: 8px;
}

.raw-dir {
  margin-right: 6px;
  opacity: 0.7;
}

/* 送出指令的欄位對照，縮排跟時間戳對齊，字級再小一號跟指令本身分開 */
.raw-legend {
  margin-left: 62px;
  font-size: 0.6875rem;
  opacity: 0.75;
  white-space: normal;
}

/* 切分頁時內容淡入淡出，讓「資料換過了」看得出來，不然新舊兩批資料常常長得一模一樣 */
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.15s ease;
}

.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
}
</style>
