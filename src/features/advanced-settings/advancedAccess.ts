import { ref } from 'vue';

// 防呆用，不是安全機制：密碼寫死在前端，目的只是擋誤觸，不是擋蓄意繞過的人。見 PROTOCOL.md 以外的規範文件說明。
const ADVANCED_PASSWORD = 'asdfasdf';

export const isAdvancedUnlocked = ref(false);

/** 驗證密碼；只記在記憶體內，重新整理後需重新輸入。失敗回傳 false 給呼叫端顯示錯誤 */
export function unlockAdvanced(password: string): boolean {
  if (password !== ADVANCED_PASSWORD) return false;
  isAdvancedUnlocked.value = true;
  return true;
}
