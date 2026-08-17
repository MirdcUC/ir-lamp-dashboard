import { ref } from 'vue';

/** 三個畫面（主畫面／設定／進階設定）共用的「目前選取的溫控器」，靠 App.vue 裡的 LampTabs 切換 */
export const activeLampId = ref(1);
