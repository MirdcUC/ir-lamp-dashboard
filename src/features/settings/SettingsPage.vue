<template>
  <div class="settings-page">
    <div class="page-head">
      <h1 class="title">設定</h1>
    </div>

    <el-card shadow="never" class="mb-4 tech-panel">
      <i class="frame-corner corner-tl" /><i class="frame-corner corner-tr" />
      <i class="frame-corner corner-bl" /><i class="frame-corner corner-br" />
      <template #header><span class="font-bold section-head"><span class="tech-tag">01</span> 感測器設定</span></template>
      <el-form label-width="110px">
        <el-form-item label="感測器類型">
          <el-select v-model="form.sensorType" class="w-full max-w-260px">
            <el-option v-for="opt in SENSOR_TYPES" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="設定溫度">
          <el-input-number
            v-model="form.sv"
            :min="SV_MIN"
            :max="SV_MAX"
            :step="svStep"
            :precision="svPrecision"
            class="w-full max-w-260px"
          />
        </el-form-item>
        <el-form-item label="溫度單位">
          <el-select v-model="form.unit" class="w-full max-w-260px">
            <el-option v-for="opt in TEMP_UNITS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="小數點">
          <el-select v-model="form.decimal" class="w-full max-w-260px">
            <el-option v-for="opt in DECIMAL_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="mb-4 tech-panel">
      <i class="frame-corner corner-tl" /><i class="frame-corner corner-tr" />
      <i class="frame-corner corner-bl" /><i class="frame-corner corner-br" />
      <template #header><span class="font-bold section-head"><span class="tech-tag">02</span> 警報設定</span></template>
      <el-form label-width="110px">
        <el-form-item label="第一組警報值 (AL1)">
          <el-input-number v-model="form.al1" :min="-99" :max="999" class="w-full max-w-260px" />
        </el-form-item>
        <el-form-item label="第二組警報值 (AL2)">
          <el-input-number v-model="form.al2" :min="-99" :max="999" class="w-full max-w-260px" />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="mb-4 tech-panel">
      <i class="frame-corner corner-tl" /><i class="frame-corner corner-tr" />
      <i class="frame-corner corner-bl" /><i class="frame-corner corner-br" />
      <template #header><span class="font-bold section-head"><span class="tech-tag">03</span> PID 設定</span></template>
      <el-form label-width="110px">
        <el-form-item label="自動調諧">
          <el-select v-model="form.autoTune" class="w-full max-w-260px">
            <el-option v-for="opt in AUTO_TUNE_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="偏移量參數">
          <el-input-number v-model="form.offset" :min="0" :max="999" class="w-full max-w-260px" />
        </el-form-item>
        <el-form-item label="P">
          <el-input-number v-model="form.p" :min="0" :max="999" class="w-full max-w-260px" />
        </el-form-item>
        <el-form-item label="I">
          <el-input-number v-model="form.i" :min="0" :max="3999" class="w-full max-w-260px" />
        </el-form-item>
        <el-form-item label="D">
          <el-input-number v-model="form.d" :min="0" :max="3999" class="w-full max-w-260px" />
        </el-form-item>
        <el-form-item label="GAin">
          <el-input-number v-model="form.gain" :min="0" :max="9.9" :step="0.1" :precision="1" class="w-full max-w-260px" />
        </el-form-item>
      </el-form>
    </el-card>

    <SaveBar :hint="commandView" @save="save">套用到溫控器 {{ activeTab }}</SaveBar>
  </div>
</template>

<script lang="ts" setup>
import { computed, reactive, watch } from 'vue';
import { useSerialStore } from '@/features/serial/store';
import { activeLampId } from '@/features/serial/activeLamp';
import { commandHintView } from '@/shared/settingsShared';
import SaveBar from '@/shared/components/SaveBar.vue';
import type { SetSetParams } from '@/features/serial/commands';
import { SV_MIN, SV_MAX } from '@/features/serial/constants';

const store = useSerialStore();

// 兩個下拉選單第 1 項一律是 0，以此類推，見 產線/紅外線控制模組_畫面.md「共同規則」
const SENSOR_TYPES = ['Pt', 'K', 'J', 'R', 'S', 'T', 'B', 'E', 'N', 'L'].map((label, value) => ({ label, value }));
const TEMP_UNITS = ['℃', '℉'].map((label, value) => ({ label, value }));
const DECIMAL_OPTIONS = ['無小數', '一位小數'].map((label, value) => ({ label, value }));
const AUTO_TUNE_OPTIONS = ['Control', 'Auto-Tuning'].map((label, value) => ({ label, value }));

const activeTab = activeLampId;

const form = reactive<SetSetParams>({
  al1: 0,
  al2: 0,
  sensorType: 0,
  sv: 0,
  unit: 0,
  decimal: 0,
  autoTune: 0,
  offset: 0,
  p: 0,
  i: 0,
  d: 0,
  gain: 0,
});

/**
 * 帶入該燈管最新收到的一行資料，不用另外的讀取指令（協定持續每台一行回報全部欄位，見 README.txt）。
 * 只在切換分頁當下讀一次快照，之後不會被之後才到的新資料覆蓋——避免使用者編輯到一半被蓋掉。
 */
const prefillFromDevice = (id: number) => {
  const status = store.lamps[id];
  Object.assign(form, {
    al1: status?.AL1 ?? 0,
    al2: status?.AL2 ?? 0,
    sensorType: status?.INT ?? 0,
    sv: status?.SV ?? 0,
    unit: status?.UNT ?? 0,
    decimal: status?.DP ?? 0,
    autoTune: status?.AT ?? 0,
    offset: status?.TU ?? 0,
    p: status?.P ?? 0,
    i: status?.I ?? 0,
    d: status?.D ?? 0,
    gain: status?.GAIN ?? 0,
  });
};

watch(activeTab, prefillFromDevice, { immediate: true });

// 設定溫度輸入框的小數位跟著「小數點」欄位（DP）走，跟主畫面顯示同一套規則，見 constants.ts formatTempValue
const svPrecision = computed(() => (form.decimal === 1 ? 1 : 0));
const svStep = computed(() => (form.decimal === 1 ? 0.5 : 1));

const commandView = computed(() => commandHintView(store.commands[activeTab.value]?.setSet));

const save = () => {
  store.writeSet(activeTab.value, { ...form });
};
</script>

<style scoped>
.settings-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  padding-bottom: 90px; /* 留空間給固定在底部的 SaveBar，避免蓋住最後一張卡片 */
}

.page-head {
  margin-bottom: 20px;
}

.title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 8px;
  position: relative;
  display: inline-block;
  padding-bottom: 6px;
}

/* 標題底線用強調色，呼應面板護角同一套科技風配色 */
.title::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  width: 36px;
  height: 3px;
  background: var(--hmi-accent);
}

.section-head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.hint-note {
  font-size: 0.75rem;
  color: var(--hmi-text-dim);
  margin: 8px 0 0;
}
</style>
