<template>
  <div id="app" class="app-shell">
    <nav class="side-nav">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        class="nav-item"
        :to="{ path: item.to, query: route.query }"
        active-class="is-active"
      >
        {{ item.label }}
      </router-link>
    </nav>
    <div class="main-column">
      <TopBar />
      <LampTabs />
      <!-- 連線診斷（?debug=1）：跨頁共用，切到設定/進階設定時仍看得到收線狀況 -->
      <DebugPanel v-if="showDebug" class="debug-slot" />
      <div class="page-body">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useRoute } from 'vue-router'
import TopBar from '@/shared/components/TopBar.vue'
import LampTabs from '@/shared/components/LampTabs.vue'
import DebugPanel from '@/shared/components/DebugPanel.vue'
import { showDebug } from '@/shared/debugVisibility'

const route = useRoute()

// 連線診斷面板初始值：?debug=1 開啟，之後可在 TopBar 用開關手動切換（見 debugVisibility.ts）
showDebug.value = 'debug' in route.query

// 三個畫面共用左側導覽列，見 產線/紅外線控制模組_畫面.md「畫面架構」；畫面切換交給 vue-router（見 app/router.ts）
// 導覽連結帶上目前的 query（?mock=1、?debug=1），切頁不中斷開發用旗標
// 頁面標籤照 pptx（2026-08-17）左側導覽欄的文字改名，見 docs/DEVICE-CHECKLIST.md H7；
// 路由（/settings、/advanced）本身不動，只改顯示文字
const navItems = [
  { to: '/', label: '主畫面' },
  { to: '/settings', label: '參數設定' },
  { to: '/advanced', label: '通訊設定' },
]
</script>

<style>
/* 全局樣式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
}

#app {
  min-height: 100vh;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang TC', 'Microsoft JhengHei', '微軟正黑體', Arial, sans-serif;
  background-color: var(--hmi-bg);
  color: var(--hmi-text);
}

.app-shell {
  display: flex;
  --side-nav-width: 140px;
}

.side-nav {
  flex: 0 0 var(--side-nav-width);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px 12px;
  background: var(--hmi-panel);
  border-right: 1px solid var(--hmi-panel-edge);
  min-height: 100vh;
}

.nav-item {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--hmi-text-dim);
  font-size: 0.875rem;
  font-weight: 600;
  text-align: left;
  padding: 10px 12px;
  border-radius: 4px;
  cursor: pointer;
}

.nav-item:hover {
  background: var(--hmi-window);
  color: var(--hmi-text);
}

.nav-item.is-active {
  background: var(--hmi-amber);
  color: #14171a;
}

.main-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.page-body {
  flex: 1;
  min-width: 0;
}

.debug-slot {
  margin: 16px 20px 0;
}

/* 滾動條樣式 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--hmi-bg);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: var(--hmi-scrollbar);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--hmi-scrollbar-hover);
}
</style>
