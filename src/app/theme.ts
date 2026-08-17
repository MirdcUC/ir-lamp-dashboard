import { ref, watch } from 'vue';

const STORAGE_KEY = 'ir-dashboard-theme';

// index.html 內的 inline script 已依 localStorage 在畫面繪製前設好 class="dark"，這裡只需讀取同步狀態，避免閃爍
export const isDark = ref(document.documentElement.classList.contains('dark'));

watch(isDark, value => {
  document.documentElement.classList.toggle('dark', value);
  localStorage.setItem(STORAGE_KEY, value ? 'dark' : 'light');
});

export const toggleTheme = () => {
  isDark.value = !isDark.value;
};
