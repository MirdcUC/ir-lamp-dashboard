<template>
  <div class="dashboard">
    <!-- 中央:目前選取溫控器的即時狀態；右側:燈管位置示意圖（四支燈管卡片總覽） -->
    <div class="dashboard-layout">
      <LampDetailPanel class="detail-col" />
      <div class="lamp-grid">
        <LampCard v-for="id in LAMP_IDS" :key="id" :id="id" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted } from 'vue';
import { useSerialStore, LAMP_IDS } from '@/features/serial/store';
import LampCard from './LampCard.vue';
import LampDetailPanel from './LampDetailPanel.vue';

const store = useSerialStore();

const params = new URLSearchParams(window.location.search);

// 網址帶 ?mock=1 時直接跑假數據展示（四支燈管自動運轉，同時吐兩種協定格式）
onMounted(() => {
  if (params.has('mock')) {
    store.startSimulation(true);
  }
});
</script>

<style scoped>
.dashboard {
  max-width: 1600px;
  margin: 0 auto;
  padding: 20px 20px 90px; /* 留空間給固定在底部的 SaveBar（LampDetailPanel.vue 的控制設定），避免蓋住內容 */
}

/* 中央即時狀態 + 右側燈管位置示意圖（總覽卡片），見 產線/紅外線控制模組_畫面.md 第 1 節版面 */
.dashboard-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 16px;
  align-items: start;
  margin-bottom: 16px;
}

.lamp-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  min-width: 0;
}

/* 窄螢幕退成單欄縱向堆疊：中央狀態在上，燈管總覽在下 */
@media (max-width: 1024px) {
  .dashboard-layout {
    grid-template-columns: 1fr;
  }
}
</style>
