<template>
  <div class="advanced-page">
    <!-- 密碼保護:防呆用,非安全機制,只記在記憶體內,重新整理需重新輸入 -->
    <div v-if="!isAdvancedUnlocked" class="unlock-box">
      <el-card shadow="never" class="unlock-card tech-panel">
        <i class="frame-corner corner-tl" /><i class="frame-corner corner-tr" />
        <i class="frame-corner corner-bl" /><i class="frame-corner corner-br" />
        <template #header><span class="font-bold">需要密碼才能進入通訊設定</span></template>
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
        <h1 class="title">通訊設定</h1>
      </div>

      <el-card shadow="never" class="mb-4 tech-panel">
        <i class="frame-corner corner-tl" /><i class="frame-corner corner-tr" />
        <i class="frame-corner corner-bl" /><i class="frame-corner corner-br" />
        <template #header><span class="font-bold section-head"><span class="tech-tag">01</span> 通訊設定</span></template>
        <el-form label-width="140px">
          <el-form-item label="站號">
            <el-input-number v-model="form.newStation" :min="1" :max="255" class="w-full max-w-260px" />
          </el-form-item>
          <el-form-item label="通訊模式">
            <el-select v-model="form.commMode" class="w-full max-w-260px">
              <el-option v-for="opt in COMM_MODES" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="通訊速度">
            <el-select v-model="form.baudRate" class="w-full max-w-260px">
              <el-option v-for="opt in BAUD_RATES" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="通訊格式">
            <el-select v-model="form.format" class="w-full max-w-260px">
              <el-option v-for="opt in COMM_FORMATS" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
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
import { lockedAdvancedFields, type SetAdvancedParams } from '@/features/serial/commands';
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

const activeTab = activeLampId;

const form = reactive<SetAdvancedParams>({
  newStation: 1,
  commMode: 0,
  baudRate: 0,
  format: 0,
});

// 切換分頁時用該燈管目前回報的值預填表單，之後不會被之後才到的新資料覆蓋——避免使用者編輯到一半被蓋掉
const prefillFromDevice = (id: number) => {
  Object.assign(form, lockedAdvancedFields(store.lamps[id], id));
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
</style>
