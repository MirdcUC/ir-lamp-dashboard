<template>
  <el-tabs v-model="activeLampId" class="lamp-tabs">
    <el-tab-pane v-for="id in LAMP_IDS" :key="id" :label="`溫控器${id}`" :name="id" />
  </el-tabs>
</template>

<script lang="ts" setup>
import { LAMP_IDS } from '@/features/serial/store';
import { activeLampId } from '@/features/serial/activeLamp';
</script>

<style scoped>
.lamp-tabs {
  padding: 0 20px;
  background: var(--hmi-panel);
  border-bottom: 1px solid var(--hmi-panel-edge);
}

.lamp-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.lamp-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

/* 分頁鈕貼齊 HMI 語彙:數碼管字體 + 青藍強調色,取代 Element 預設藍 */
.lamp-tabs :deep(.el-tabs__item) {
  font-family: var(--hmi-digits);
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--hmi-text-dim);
  transition: color 0.15s ease;
}

.lamp-tabs :deep(.el-tabs__item:hover),
.lamp-tabs :deep(.el-tabs__item.is-active) {
  color: var(--hmi-accent);
}

.lamp-tabs :deep(.el-tabs__active-bar) {
  background: var(--hmi-accent);
  box-shadow: 0 0 8px var(--hmi-accent-dim);
  height: 3px;
}
</style>
