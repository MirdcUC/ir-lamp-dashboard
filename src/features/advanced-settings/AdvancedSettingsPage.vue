<template>
  <div class="advanced-page">
    <!-- 密碼保護:防呆用,非安全機制,只記在記憶體內,重新整理需重新輸入 -->
    <div v-if="!isAdvancedUnlocked" class="unlock-box">
      <el-card shadow="never" class="unlock-card tech-panel">
        <i class="frame-corner corner-tl" /><i class="frame-corner corner-tr" />
        <i class="frame-corner corner-bl" /><i class="frame-corner corner-br" />
        <template #header><span class="font-bold">需要密碼才能進入進階設定</span></template>
        <el-form @submit.prevent>
          <el-form-item label="密碼" :error="error">
            <el-input v-model="passwordInput" type="password" show-password @keyup.enter="tryUnlock" />
          </el-form-item>
        </el-form>
        <div class="flex justify-end">
          <el-button type="primary" @click="tryUnlock">確認</el-button>
        </div>
      </el-card>
    </div>

    <div v-else>
      <div class="page-head">
        <h1 class="title">進階設定</h1>
      </div>

      <el-card shadow="never" class="mb-4 tech-panel">
        <i class="frame-corner corner-tl" /><i class="frame-corner corner-tr" />
        <i class="frame-corner corner-bl" /><i class="frame-corner corner-br" />
        <template #header><span class="font-bold section-head"><span class="tech-tag">01</span> 溫控器設定</span></template>
        <p class="hint-note is-strong">
          ⚠ 站號／通訊模式／通訊速度／通訊格式這四項<strong>目前鎖定、無法從這個畫面修改</strong>
        </p>
        <el-form label-width="140px">
          <el-form-item label="站號">
            <el-input-number :model-value="lockedFields.newStation" disabled class="w-full max-w-260px" />
          </el-form-item>
          <el-form-item label="通訊模式">
            <el-select :model-value="lockedFields.commMode" disabled class="w-full max-w-260px">
              <el-option v-for="opt in COMM_MODES" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="通訊速度">
            <el-select :model-value="lockedFields.baudRate" disabled class="w-full max-w-260px">
              <el-option v-for="opt in BAUD_RATES" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="通訊格式">
            <el-select :model-value="lockedFields.format" disabled class="w-full max-w-260px">
              <el-option v-for="opt in COMM_FORMATS" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="控制模式選擇">
            <el-select v-model="form.controlMode" class="w-full max-w-260px">
              <el-option v-for="opt in CONTROL_MODES" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>
          <!-- 自動模式下不顯示這個欄位；送出時 store.ts 會把 NUN 覆寫成 -1。
               NUN 目前該送什麼值才會被接受還不穩定（同樣送 -1 曾經 OK、也曾經被 SET_ERROR
               拒絕），見 CHANGELOG.md，先讓手動模式照舊可以輸入 -->
          <el-form-item v-if="isManualControl" label="NUN（手動輸出量）">
            <el-input-number v-model="form.nUn" :min="0" :max="100" class="w-full max-w-260px" />
          </el-form-item>
        </el-form>
      </el-card>

      <SaveBar :hint="commandView" @save="save">套用到溫控器 {{ activeTab }}</SaveBar>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import { useSerialStore } from '@/features/serial/store';
import { activeLampId } from '@/features/serial/activeLamp';
import { commandHintView } from '@/shared/settingsShared';
import SaveBar from '@/shared/components/SaveBar.vue';
import { isAdvancedUnlocked, unlockAdvanced } from './advancedAccess';
import { lockedAdvancedFields } from '@/features/serial/commands';
import { BAUD_RATE_VALUES } from '@/features/serial/constants';

const store = useSerialStore();

const passwordInput = ref('');
const error = ref('');
const tryUnlock = () => {
  if (unlockAdvanced(passwordInput.value)) {
    error.value = '';
    passwordInput.value = '';
  } else {
    error.value = '密碼錯誤';
  }
};

// 下拉選單第 1 項一律是 0，以此類推，見 README.txt 第 14、15、16 項
const COMM_MODES = ['RTU', 'ASCII'].map((label, value) => ({ label, value }));
// 標籤沿用 BAUD_RATE_VALUES（commands.ts 送出 SET_ADVANCED 時也是查這張表），避免兩處各自維護一份不同步
const BAUD_RATES = BAUD_RATE_VALUES.map((bps, value) => ({ label: String(bps), value }));
const COMM_FORMATS = ['7O1', '7E1', '8N1', '8O1', '8E1', '8N2'].map((label, value) => ({ label, value }));
const CONTROL_MODES = ['自動', '手動'].map((label, value) => ({ label, value }));

const activeTab = activeLampId;

// 真正能送出去的是這兩項，見 store.ts 的 writeAdvanced 說明
const form = reactive({
  controlMode: 0,
  nUn: 0,
});

const isManualControl = computed(() => form.controlMode === 1);

// 站號／通訊模式／通訊速度／通訊格式唯讀顯示用，跟 store.ts 送出時的來源共用同一個函式，
// 保證畫面看到的「目前值」跟實際會送出去的「維持不變」值一致
const lockedFields = computed(() => lockedAdvancedFields(store.lamps[activeTab.value], activeTab.value));

/**
 * 帶入該燈管最新收到的一行資料，不用另外的讀取指令（協定持續每台一行回報全部欄位）。
 * 只在切換分頁當下讀一次快照，之後不會被之後才到的新資料覆蓋——避免使用者編輯到一半被蓋掉。
 * 另外四項是唯讀顯示，交給 `lockedFields` 即時算，不用進表單。
 */
const prefillFromDevice = (id: number) => {
  const status = store.lamps[id];
  Object.assign(form, {
    controlMode: status?.M_A ?? 0,
    nUn: status?.NUN ?? 0,
  });
};

watch(activeTab, prefillFromDevice, { immediate: true });

const commandView = computed(() => commandHintView(store.commands[activeTab.value]?.setAdvanced));

const save = () => {
  store.writeAdvanced(activeTab.value, { ...form });
};
</script>

<style scoped>
.advanced-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  padding-bottom: 90px; /* 留空間給固定在底部的 SaveBar，避免蓋住最後一張卡片 */
}

.unlock-box {
  display: flex;
  justify-content: center;
  padding-top: 80px;
}

.unlock-card {
  width: 360px;
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

/* 「這幾項鎖住不能改」的警告要比一般提示文字更醒目，用警示色跟底色框起來 */
.hint-note.is-strong {
  margin: 0 0 16px;
  padding: 10px 12px;
  border: 1px solid var(--hmi-amber-text);
  border-radius: 3px;
  background: rgba(255, 190, 60, 0.08);
  color: var(--hmi-amber-text);
  font-weight: 600;
  line-height: 1.6;
}
</style>
