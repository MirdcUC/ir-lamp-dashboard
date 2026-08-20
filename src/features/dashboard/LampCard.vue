<template>
  <div class="lamp-panel tech-panel" :class="{ 'is-alarm': hasAlarm }">
    <i class="frame-corner corner-tl" /><i class="frame-corner corner-tr" />
    <i class="frame-corner corner-bl" /><i class="frame-corner corner-br" />

    <!-- 面板頭:設備編號 + 指示燈列 -->
    <div class="panel-head">
      <div class="panel-id">
        <span class="panel-tag">溫控器-{{ id }}</span>
        <span class="panel-name">燈管_{{ id }}</span>
      </div>
      <div class="led-cluster">
        <span class="led led-green" :class="{ 'is-lit': status.ON_OFF === 0 }">
          <i class="led-dot" />運轉
        </span>
      </div>
    </div>

    <!-- 警報告示:遠看要能立刻辨識是哪個警報 -->
    <div v-if="hasAlarm" class="alarm-banner">▲ {{ alarmText }}</div>

    <!-- 顯示窗:復刻 NT-48L-RS 紅 PV 數碼管 -->
    <div class="display-window hmi-glass">
      <div class="readout readout-pv">
        <span class="readout-label">現在溫度</span>
        <span class="readout-value" :class="{ 'is-dim': status.PV === null || connection !== 'online' }">
          {{ formatTempValue(status.PV, status.DP) }}
        </span>
        <span class="readout-unit">{{ unitLabel }}</span>
      </div>
      <div class="readout readout-sv">
        <span class="readout-label">設定溫度</span>
        <span class="readout-value" :class="{ 'is-dim': status.SV === null || connection !== 'online' }">
          {{ formatTempValue(status.SV, status.DP) }}
        </span>
        <span class="readout-unit">{{ unitLabel }}</span>
      </div>
      <div v-if="showUpdatedText" class="readout-updated" :class="{ 'is-warn': active && connection !== 'online' }">
        {{ updatedText }}
      </div>
    </div>

    <!-- 輸出 LED bar graph -->
    <div class="out-block">
      <div class="out-head">
        <span class="out-label">實際輸出量</span>
        <span class="out-value">{{ status.UN !== null ? status.UN.toFixed(0) + ' %' : '-- %' }}</span>
      </div>
      <div class="out-bar" role="img" :aria-label="`輸出 ${status.UN ?? 0}%`">
        <i
          v-for="n in OUT_SEGMENTS"
          :key="n"
          class="out-seg"
          :class="{ 'is-lit': litSegments >= n, 'is-high': n > highSegmentFrom }"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useSerialStore } from '@/features/serial/store';
import { OUT_HIGH_PERCENT, tempUnitLabel, formatTempValue } from '@/features/serial/constants';
import { STATUS_BITS, hasBit } from '@/features/serial/alarmStatus';
import type { LampConnection } from '@/features/serial/types';

const props = defineProps<{ id: number }>();

const store = useSerialStore();

// store 內以 LAMP_IDS 初始化，索引必有值
const status = computed(() => store.lamps[props.id]!);
const active = computed(() => store.isConnected || store.isSimulating);
// STATUS 是 Bit Mask，bit 為 1 代表該路 ON，見 alarmStatus.ts
const al1On = computed(() => hasBit(status.value.STATUS, STATUS_BITS.AL1));
const al2On = computed(() => hasBit(status.value.STATUS, STATUS_BITS.AL2));
const hasAlarm = computed(() => al1On.value || al2On.value);

const connection = computed<LampConnection>(() => store.connections[props.id] ?? 'offline');
const unitLabel = computed(() => tempUnitLabel(status.value.UNT));

const alarmText = computed(() =>
  [al1On.value ? 'AL1' : null, al2On.value ? 'AL2' : null].filter(Boolean).join('・') + ' 警報',
);

const OUT_SEGMENTS = 20;
const litSegments = computed(() =>
  Math.round(Math.min(100, Math.max(0, status.value.UN ?? 0)) / (100 / OUT_SEGMENTS)),
);
const highSegmentFrom = (OUT_HIGH_PERCENT / 100) * OUT_SEGMENTS;

const updatedText = computed(() => {
  if (!active.value) return '尚未連線';

  const age = store.staleness[props.id];
  if (age === null || age === undefined) return '尚未收到資料';

  const seconds = Math.floor(age / 1000);
  return seconds <= 1 ? '剛剛更新' : `${seconds} 秒前更新`;
});

// 連線正常時不特別顯示更新時間，只在斷線／尚未收到資料／資料變舊時才提醒，減少畫面雜訊
const showUpdatedText = computed(() => !active.value || connection.value !== 'online' || store.staleness[props.id] == null);

</script>

<style scoped>
.lamp-panel {
  background: var(--hmi-panel);
  border: 1px solid var(--hmi-panel-edge);
  border-radius: 4px;
  padding: 12px 14px 14px;
  box-shadow: var(--hmi-panel-shadow);
}

/* 有警報時整張面板標紅，遠看也能發現 */
.lamp-panel.is-alarm {
  border-color: var(--hmi-alarm);
  box-shadow: 0 0 12px rgba(255, 69, 69, 0.35);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  /* 320px 級窄螢幕讓 LED 列換行,不要撐開卡片 */
  flex-wrap: wrap;
}

.panel-id {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.panel-tag {
  font-family: var(--hmi-digits);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--hmi-text);
  /* 左側強調色刻線:機台銘牌的定位記號 */
  border-left: 2px solid var(--hmi-accent);
  padding-left: 7px;
}

.panel-name {
  font-size: 0.75rem;
  color: var(--hmi-text-dim);
  white-space: nowrap;
}

/* ---------------- LED 指示燈列 ---------------- */
.led-cluster {
  display: flex;
  align-items: center;
  gap: 8px;
}

.alarm-banner {
  /* 危險斜紋底,呼應 TopBar 上緣的安全警示斜紋;透明度壓低不影響文字判讀 */
  background: repeating-linear-gradient(
    -45deg,
    rgba(255, 69, 69, 0.18) 0 10px,
    rgba(255, 69, 69, 0.07) 10px 20px
  );
  border: 1px solid var(--hmi-alarm);
  border-radius: 2px;
  color: var(--hmi-alarm);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 4px 8px;
  margin-bottom: 8px;
}

/* ---------------- 顯示窗 ---------------- */
.display-window {
  background: var(--hmi-window);
  border: 1px solid var(--hmi-panel-edge);
  border-radius: 3px;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.6);
  padding: 10px 14px 8px;
  margin-bottom: 12px;
}

.readout {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.readout-label {
  font-family: var(--hmi-digits);
  font-size: 0.6875rem;
  letter-spacing: 0.1em;
  color: var(--hmi-text-dim);
  white-space: nowrap;
}

.readout-value {
  flex: 1;
  text-align: right;
  font-family: var(--hmi-digits);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.readout-unit {
  font-family: var(--hmi-digits);
  font-size: 1rem;
  color: var(--hmi-text-dim);
  width: 24px;
}

.readout-pv .readout-value {
  font-size: 2.75rem;
  line-height: 1.05;
  color: var(--hmi-readout-pv);
  text-shadow: var(--hmi-readout-pv-glow);
}

.readout-value.is-dim {
  color: var(--hmi-readout-dim);
  text-shadow: none;
}

.readout-sv {
  margin-top: 2px;
}

.readout-sv .readout-value {
  font-size: 1.5rem;
  color: var(--hmi-readout-sv);
  text-shadow: var(--hmi-readout-sv-glow);
}

.readout-updated {
  font-size: 0.6875rem;
  color: var(--hmi-text-dim);
  text-align: right;
  margin-top: 4px;
}

.readout-updated.is-warn {
  color: var(--hmi-amber-text);
  font-weight: 600;
}

/* ---------------- 輸出 bar graph ---------------- */
.out-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

.out-label {
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  color: var(--hmi-text-dim);
}

.out-value {
  font-family: var(--hmi-digits);
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--hmi-text);
  font-variant-numeric: tabular-nums;
}

/* bar graph 也放進內凹顯示窗,跟上面的數碼管窗同一套「嵌在鈑金上的模組」層次 */
.out-bar {
  display: flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--hmi-panel-edge);
  border-radius: 3px;
  background: var(--hmi-window);
  box-shadow: var(--hmi-window-inset);
}

.out-seg {
  flex: 1;
  height: 12px;
  border-radius: 1px;
  background: var(--hmi-led-off);
}

/* 實機 bargraph 為黃/紅段;紅色門檻取 80% 而非實機比例，避免中等輸出就滿眼紅 */
.out-seg.is-lit {
  background: var(--hmi-led-yellow);
  box-shadow: 0 0 4px rgba(255, 217, 74, 0.4);
}

.out-seg.is-lit.is-high {
  background: var(--hmi-led-red);
  box-shadow: 0 0 4px rgba(255, 90, 60, 0.4);
}

</style>
