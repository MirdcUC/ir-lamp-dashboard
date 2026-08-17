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
</style>
