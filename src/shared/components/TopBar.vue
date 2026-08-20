<template>
  <div class="topbar flex items-center justify-between">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="nameplate">
        <span class="nameplate-tag">MIRDC</span>
        <h1 class="title">紅外線燈管控制模組</h1>
      </div>
      <div class="status-block">
        <span class="status-led" :class="statusLedClass" />
        <span class="status-text">{{ statusText }}</span>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span v-if="!serialSupported" class="env-hint">
        此環境不支援串列連線，請用 Chrome / Edge 開啟（非 localhost 需 HTTPS）
      </span>
      <span class="clock">{{ clockText }}</span>
      <el-button circle title="切換明暗主題" @click="toggleTheme">{{ isDark ? '☀' : '☾' }}</el-button>
      <div class="flex items-center gap-2 debug-toggle">
        <span class="switch-label">連線診斷</span>
        <el-switch v-model="showDebug" />
      </div>
      <div class="flex items-center gap-2">
        <el-button
          v-if="!store.isConnected"
          type="primary"
          :disabled="store.isSimulating || !serialSupported"
          @click="store.connect"
        >
          連線裝置
        </el-button>
        <el-button v-else type="danger" @click="store.disconnect">中斷連線</el-button>

        <el-button v-if="store.isSimulating" type="warning" @click="store.stopSimulation">停止模擬</el-button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useSerialStore } from '@/features/serial/store';
import { isSerialSupported } from '@/features/serial/connection';
import { isDark, toggleTheme } from '@/app/theme';
import { showDebug } from '@/shared/debugVisibility';

const store = useSerialStore();
const serialSupported = isSerialSupported();

const statusText = computed(() => {
  if (store.isConnected) return '已連線';
  if (store.isSimulating) return '模擬中';
  return '未連線';
});
const statusLedClass = computed(() => {
  if (store.isConnected) return 'is-online';
  if (store.isSimulating) return 'is-sim';
  return 'is-off';
});

// 現場時鐘:操作員回報異常時要能對照牆上時間
const clockText = ref('');
let clockTimer = 0;
const tickClock = () => {
  clockText.value = new Date().toLocaleTimeString('zh-TW', { hour12: false });
};
onMounted(() => {
  tickClock();
  clockTimer = window.setInterval(tickClock, 1000);
});
onUnmounted(() => window.clearInterval(clockTimer));
</script>

<style scoped>
/* 機台銘牌列:上緣一道安全警示斜紋,底下是鈑金面板 */
.topbar {
  padding: 12px 20px;
  background: var(--hmi-panel);
  border-bottom: 1px solid var(--hmi-panel-edge);
  border-top: 4px solid transparent;
  border-image: repeating-linear-gradient(
      -45deg,
      var(--hmi-amber) 0 10px,
      #14171a 10px 20px
    )
    4;
  /* 窄螢幕改成整組換行,而不是把文字壓成直排 */
  flex-wrap: wrap;
  row-gap: 10px;
}

.nameplate {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nameplate-tag {
  font-family: var(--hmi-digits);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--hmi-amber-text);
  border: 1px solid var(--hmi-amber-text);
  padding: 2px 8px;
  border-radius: 2px;
  white-space: nowrap;
}

.title {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--hmi-text);
  white-space: nowrap;
}

/* 狀態燈放進內凹的小窗,跟時鐘同一套「嵌在鈑金上的模組」語彙 */
.status-block {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--hmi-window);
  border: 1px solid var(--hmi-panel-edge);
  border-radius: 3px;
  box-shadow: var(--hmi-window-inset);
  padding: 4px 12px;
}

.status-led {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--hmi-led-off);
  border: 1px solid var(--hmi-led-dot-border);
}

.status-led.is-online {
  background: var(--hmi-led-green);
  box-shadow: 0 0 8px var(--hmi-led-green);
}

.status-led.is-sim {
  background: var(--hmi-amber);
  box-shadow: 0 0 8px var(--hmi-amber);
}

.status-text {
  font-size: 0.8125rem;
  color: var(--hmi-text-dim);
  white-space: nowrap;
}

.env-hint {
  font-size: 0.75rem;
  color: var(--hmi-amber-text);
  max-width: 320px;
}

.switch-label {
  font-size: 0.75rem;
  color: var(--hmi-text-dim);
  white-space: nowrap;
}

/* 現場時鐘裝進顯示窗,讀起來像嵌在鈑金上的 LED 時鐘模組 */
.clock {
  font-family: var(--hmi-digits);
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--hmi-live-text);
  text-shadow: var(--hmi-live-glow);
  font-variant-numeric: tabular-nums;
  background: var(--hmi-window);
  border: 1px solid var(--hmi-panel-edge);
  border-radius: 3px;
  box-shadow: var(--hmi-window-inset);
  padding: 3px 12px;
}
</style>
