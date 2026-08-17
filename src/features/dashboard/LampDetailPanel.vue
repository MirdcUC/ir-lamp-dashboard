<template>
  <el-card shadow="never" class="detail-panel tech-panel">
    <i class="frame-corner corner-tl" /><i class="frame-corner corner-tr" />
    <i class="frame-corner corner-bl" /><i class="frame-corner corner-br" />

    <template #header>
      <div class="flex items-center justify-between">
        <span class="font-bold panel-title">
          <i class="status-pulse" :class="{ 'is-live': active }" />
          溫控器{{ activeLampId }} 即時狀態
        </span>
        <div class="run-toggle">
          <el-radio-group
            :model-value="status?.ON_OFF === 0 ? 'on' : 'off'"
            :disabled="!active"
            size="small"
            @change="(v: string | number | boolean) => store.setRun(activeLampId, v === 'on')"
          >
            <el-radio-button value="on">運轉</el-radio-button>
            <el-radio-button value="off">停止</el-radio-button>
          </el-radio-group>
          <span v-if="runCommandView" class="cmd-hint" :class="runCommandView.cls">{{ runCommandView.text }}</span>
        </div>
      </div>
    </template>

    <div class="metric-grid">
      <div class="metric metric-temp">
        <span class="metric-label">現在溫度</span>
        <span class="metric-value">{{ fmt(status?.PV) }}<span class="metric-unit">{{ unitLabel }}</span></span>
      </div>
      <div class="metric metric-out">
        <span class="metric-label">現在輸出量</span>
        <span class="metric-value">{{ fmt(status?.UN) }}<span class="metric-unit">%</span></span>
      </div>
    </div>

    <div class="panel-divider"><span>控制設定</span></div>
    <el-form label-width="110px" class="control-form">
      <el-form-item label="設定溫度">
        <el-input-number
          v-model="controlForm.sv"
          :min="SV_MIN"
          :max="SV_MAX"
          :step="svStep"
          :precision="svPrecision"
          class="w-full max-w-260px"
        />
      </el-form-item>
      <el-form-item label="控制模式選擇">
        <el-select v-model="controlForm.controlMode" class="w-full max-w-260px">
          <el-option v-for="opt in CONTROL_MODES" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </el-form-item>
      <!-- 自動模式下不顯示這個欄位；送出時 store.writeMain 會把 NUN 覆寫成 -1，見 store.ts 說明 -->
      <el-form-item v-if="isManualControl" label="手動輸出量">
        <el-input-number v-model="controlForm.nUn" :min="0" :max="100" class="w-full max-w-260px" />
      </el-form-item>
    </el-form>

    <div class="panel-divider"><span>輸出與警報監控</span></div>
    <div class="io-row">
      <div class="io-group">
        <span class="io-group-label">輸出</span>
        <span class="led" :class="{ 'led-green is-lit': isBitOn(status?.STATUS, STATUS_BITS.OUT1) }"><i class="led-dot" />OUT1</span>
      </div>
      <div class="io-group">
        <span class="io-group-label">警報</span>
        <!-- 閃爍全部先關掉，使用者要求「先隱藏，真的需要再加回來」——加回去就是把 is-blink 補回這兩個 class 裡 -->
        <span class="led" :class="{ 'led-red is-lit': isBitOn(status?.STATUS, STATUS_BITS.AL1) }"><i class="led-dot" />AL1</span>
        <span class="led" :class="{ 'led-red is-lit': isBitOn(status?.STATUS, STATUS_BITS.AL2) }"><i class="led-dot" />AL2</span>
      </div>
    </div>

    <div class="alarm-row">
      <span class="metric-label">警報狀態</span>
      <span class="metric-value">{{ alarmText }}</span>
    </div>
  </el-card>

  <SaveBar :hint="runCommandView" @save="saveControl">套用到溫控器 {{ activeLampId }}</SaveBar>
</template>

<script lang="ts" setup>
import { computed, reactive, watch } from 'vue';
import { useSerialStore } from '@/features/serial/store';
import { activeLampId } from '@/features/serial/activeLamp';
import { STATUS_BITS, activeAlarmCodes, hasBit } from '@/features/serial/alarmStatus';
import { tempUnitLabel, SV_MIN, SV_MAX } from '@/features/serial/constants';
import { commandHintView } from '@/shared/settingsShared';
import SaveBar from '@/shared/components/SaveBar.vue';

const store = useSerialStore();

const active = computed(() => store.isConnected || store.isSimulating);
const status = computed(() => store.lamps[activeLampId.value]);
const unitLabel = computed(() => tempUnitLabel(status.value?.UNT));
// CommandType 'main' 涵蓋 Run/Stop、設定溫度、控制模式/手動輸出量，見 commandTracker.ts 的說明
const runCommandView = computed(() => commandHintView(store.commands[activeLampId.value]?.main));

const fmt = (v: number | null | undefined) => (v !== null && v !== undefined ? String(v) : '--');

// pptx slide 1 的 (2)(3)(4)：設定溫度／控制模式選擇／手動輸出量，畫在主畫面，見 docs/DEVICE-CHECKLIST.md H 節
const CONTROL_MODES = ['自動', '手動'].map((label, value) => ({ label, value }));

const controlForm = reactive({ sv: 0, controlMode: 0, nUn: 0 });
const isManualControl = computed(() => controlForm.controlMode === 1);

// 設定溫度輸入框的小數位跟著這支燈管目前回報的 DP 走，跟主畫面顯示同一套規則，見 constants.ts formatTempValue
const svPrecision = computed(() => (status.value?.DP === 1 ? 1 : 0));
const svStep = computed(() => (status.value?.DP === 1 ? 0.5 : 1));

/**
 * 帶入該燈管最新收到的一行資料，不用另外的讀取指令（協定持續每台一行回報全部欄位）。
 * 只在切換分頁當下讀一次快照，之後不會被之後才到的新資料覆蓋——避免使用者編輯到一半被蓋掉。
 */
const prefillFromDevice = (id: number) => {
  const lamp = store.lamps[id];
  Object.assign(controlForm, {
    sv: lamp?.SV ?? 0,
    controlMode: lamp?.M_A ?? 0,
    nUn: lamp?.NUN ?? 0,
  });
};

// 這個面板是應用程式一開始就掛載的主畫面，切換分頁當下資料很可能還沒進來（連線/模擬都是非同步），
// 跟 SettingsPage.vue／AdvancedSettingsPage.vue 那種「使用者主動點進頁面時資料通常已經在跑」的情境
// 不同。因此除了切換分頁當下先讀一次，還要等這支燈管「第一次真的收到資料」時再補讀一次快照，
// 避免定格在 0；拿到之後就不再追蹤，維持原本「不蓋掉使用者編輯到一半的值」的行為。
let pendingSnapshotId: number | null = null;

watch(
  activeLampId,
  id => {
    pendingSnapshotId = id;
    prefillFromDevice(id);
  },
  { immediate: true },
);

watch(
  () => status.value?.SV,
  sv => {
    if (pendingSnapshotId !== activeLampId.value) return; // 已經拿過正式快照，不要再蓋
    if (sv === null || sv === undefined) return; // 還沒收到資料
    prefillFromDevice(activeLampId.value);
    pendingSnapshotId = null;
  },
);

const saveControl = () => {
  store.writeMain(activeLampId.value, {
    sv: controlForm.sv,
    controlMode: controlForm.controlMode,
    nUn: isManualControl.value ? controlForm.nUn : -1,
  });
};

// STATUS 是 Bit Mask，bit 為 1 代表該路 ON，見 src/features/serial/alarmStatus.ts
const isBitOn = hasBit;

const alarmText = computed(() => {
  const codes = activeAlarmCodes(status.value?.ALARM);
  return codes.length > 0 ? codes.join('・') : '正常';
});
</script>

<style scoped>
.detail-panel {
  overflow: visible;
}

.panel-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 1.0625rem;
  letter-spacing: 0.04em;
}

.run-toggle {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.cmd-hint {
  font-size: 0.875rem;
}

.cmd-pending {
  color: var(--el-color-info);
}

.cmd-ok {
  color: var(--el-color-success);
}

.cmd-warn {
  color: var(--hmi-amber-text);
  font-weight: 600;
}

.cmd-sent {
  color: var(--hmi-text-dim);
}

.cmd-error {
  color: var(--hmi-led-red, var(--el-color-danger));
  font-weight: 600;
}

/* 心跳燈：有連線/模擬時常亮並脈動，呼應 LampCard 的 COM 燈語彙 */
.status-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--hmi-led-off);
  flex: none;
}

.status-pulse.is-live {
  background: var(--hmi-led-green);
  box-shadow: 0 0 8px var(--hmi-led-green);
  animation: status-pulse-blink 2s ease-in-out infinite;
}

@keyframes status-pulse-blink {
  50% {
    opacity: 0.4;
  }
}

@media (prefers-reduced-motion: reduce) {
  .status-pulse.is-live {
    animation: none;
  }
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 8px;
  position: relative;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--hmi-window);
  border: 1px solid var(--hmi-panel-edge);
  border-top: 2px solid var(--hmi-accent-dim);
  border-radius: 3px;
  padding: 10px 12px;
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.25);
}

.metric-temp {
  border-top-color: var(--hmi-led-red);
}

.metric-out {
  border-top-color: var(--hmi-amber);
}

.metric-label {
  font-size: 0.8125rem;
  letter-spacing: 0.08em;
  color: var(--hmi-text-dim);
}

.metric-value {
  font-family: var(--hmi-digits);
  font-size: 1.375rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--hmi-text);
}

.metric-unit {
  font-size: 1rem;
  font-weight: 600;
  color: var(--hmi-text-dim);
  margin-left: 3px;
}

.panel-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 8px;
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  color: var(--hmi-text-dim);
}

.panel-divider::before,
.panel-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--hmi-panel-edge);
}

.io-row {
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
  background: var(--hmi-window);
  border: 1px solid var(--hmi-panel-edge);
  border-radius: 3px;
  padding: 12px 16px;
}

/* 輸出／警報分成兩組，各自加小標籤——兩者意義不同，不該長得一模一樣；燈號放大到跟上面三個數值卡同一個視覺量級 */
.io-group {
  display: flex;
  align-items: center;
  gap: 14px;
}

.io-group-label {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--hmi-text-dim);
  white-space: nowrap;
}

.io-group .led {
  font-size: 0.9375rem;
  font-weight: 700;
  gap: 7px;
}

.io-group .led-dot {
  width: 14px;
  height: 14px;
}

.alarm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--hmi-panel-edge);
}

.alarm-row .metric-value {
  font-size: 1.125rem;
}
</style>
