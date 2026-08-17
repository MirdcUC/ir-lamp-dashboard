import { withOfflineNote, type CommandState } from '@/features/serial/commandTracker';

/** 設定畫面／進階設定畫面共用的 SET_SET/SET_ADVANCED read-back 提示文字，跟 LampCard.vue 的 commandView 邏輯一致 */
export function commandHintView(state: CommandState | undefined) {
  if (!state) return null;
  const view = (() => {
    switch (state.status) {
      case 'pending':
        return { text: `已送出 ${state.requestedText}，等待裝置回報`, cls: 'cmd-pending' };
      case 'confirmed':
        return { text: `裝置已回報 ${state.requestedText}`, cls: 'cmd-ok' };
      case 'unconfirmed':
        return { text: `裝置未確認 ${state.requestedText}，結果未知`, cls: 'cmd-warn' };
      case 'sent':
        return { text: `已送出 ${state.requestedText}`, cls: 'cmd-sent' };
      case 'rejected':
        return { text: `${state.requestedText} 被裝置拒絕：${state.errorText ?? '原因不明'}`, cls: 'cmd-error' };
    }
  })();
  return withOfflineNote(state, view);
}
