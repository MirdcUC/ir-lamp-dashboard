<template>
  <div class="save-bar">
    <div class="save-bar-inner">
      <el-button type="primary" @click="$emit('save')"><slot /></el-button>
      <div v-if="hint" class="cmd-hint" :class="hint.cls">{{ hint.text }}</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
defineProps<{ hint: { text: string; cls: string } | null }>();
defineEmits<{ save: [] }>();
</script>

<style scoped>
/* 固定在畫面底部，不用滾到最下面才找得到儲存按鈕；settings/advanced-settings 兩頁共用 */
.save-bar {
  position: fixed;
  left: var(--side-nav-width, 140px);
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  padding: 12px 20px;
  /* 半透明+模糊:內容從底下捲過去時看得出這條是浮在上面的操作列 */
  background: color-mix(in srgb, var(--hmi-panel) 88%, transparent);
  backdrop-filter: blur(6px);
  border-top: 1px solid var(--hmi-panel-edge);
  z-index: 10;
}

/* 上緣通電線,跟 .tech-panel 面板的走線同一套語彙 */
.save-bar::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--hmi-accent-dim), transparent);
  pointer-events: none;
}

.save-bar-inner {
  width: 100%;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.cmd-hint {
  font-size: 0.75rem;
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

.cmd-error {
  color: var(--hmi-led-red, var(--el-color-danger));
  font-weight: 600;
}
</style>
