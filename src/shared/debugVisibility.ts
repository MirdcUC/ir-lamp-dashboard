import { ref } from 'vue';

/** 連線診斷面板（DebugPanel）開關；初始值來自網址 ?debug=1，之後可在 TopBar 手動切換，三個畫面共用同一份 */
export const showDebug = ref(false);
