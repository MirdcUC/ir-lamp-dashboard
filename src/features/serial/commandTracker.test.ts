import { describe, expect, it } from 'vitest';
import { createCommandTracker, withOfflineNote } from './commandTracker';
import { buildLampMap, initLampStatus } from './constants';
import type { LampStatus } from './types';

const T0 = 1_700_000_000_000;

function reported(overrides: Record<number, Partial<LampStatus>> = {}) {
  const lamps = buildLampMap(initLampStatus);
  for (const [id, patch] of Object.entries(overrides)) {
    lamps[Number(id)] = { ...lamps[Number(id)]!, ...patch };
  }
  return lamps;
}

describe('指令 read-back 驗證', () => {
  it('回報值與要求值相符時標記為已確認', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, false);
    expect(tracker.commands.value[1]?.run?.status).toBe('pending');

    tracker.verify(reported({ 1: { ON_OFF: 0 } }), T0 + 1000);
    expect(tracker.commands.value[1]?.run?.status).toBe('confirmed');
  });

  it('回報值不符時維持等待，不會誤判成功', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, false);

    tracker.verify(reported({ 1: { ON_OFF: 1 } }), T0 + 1000);
    expect(tracker.commands.value[1]?.run?.status).toBe('pending');
  });

  it('Run/Stop 以 ON_OFF（0=ON/1=OFF）比對', () => {
    const tracker = createCommandTracker();
    tracker.start(3, 'run', [1], '停止', T0, false);

    tracker.verify(reported({ 3: { ON_OFF: 0 } }), T0 + 1000);
    expect(tracker.commands.value[3]?.run?.status).toBe('pending');

    tracker.verify(reported({ 3: { ON_OFF: 1 } }), T0 + 2000);
    expect(tracker.commands.value[3]?.run?.status).toBe('confirmed');
  });

  it('5 秒內未相符標記為未確認，而非失敗', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, false);

    tracker.tick(T0 + 4_999);
    expect(tracker.commands.value[1]?.run?.status).toBe('pending');

    tracker.tick(T0 + 5_000);
    expect(tracker.commands.value[1]?.run?.status).toBe('unconfirmed');
  });

  it('未確認的提示不會自動消失', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, false);
    tracker.tick(T0 + 5_000);

    tracker.tick(T0 + 60_000);
    expect(tracker.commands.value[1]?.run?.status).toBe('unconfirmed');
  });

  it('已確認的提示顯示一段時間後自動清除', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, false);
    tracker.verify(reported({ 1: { ON_OFF: 0 } }), T0 + 1000);

    tracker.tick(T0 + 5_999);
    expect(tracker.commands.value[1]?.run?.status).toBe('confirmed');

    tracker.tick(T0 + 6_000);
    expect(tracker.commands.value[1]?.run).toBeUndefined();
  });

  it('尚未回報過該欄位時不算相符', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, false);

    tracker.verify(reported(), T0 + 1000); // ON_OFF 仍為 null
    expect(tracker.commands.value[1]?.run?.status).toBe('pending');
  });

  it('各台指令互不干擾', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, false);
    tracker.start(2, 'run', [0], '運轉', T0, false);

    tracker.verify(reported({ 1: { ON_OFF: 0 }, 2: { ON_OFF: 1 } }), T0 + 1000);
    expect(tracker.commands.value[1]?.run?.status).toBe('confirmed');
    expect(tracker.commands.value[2]?.run?.status).toBe('pending');
  });

  it('重送同型指令會覆蓋前一次的結果', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, false);
    tracker.tick(T0 + 5_000);
    expect(tracker.commands.value[1]?.run?.status).toBe('unconfirmed');

    tracker.start(1, 'run', [1], '停止', T0 + 6_000, false);
    expect(tracker.commands.value[1]?.run?.status).toBe('pending');

    tracker.verify(reported({ 1: { ON_OFF: 0 } }), T0 + 7_000);
    expect(tracker.commands.value[1]?.run?.status).toBe('pending'); // 舊值不算數
  });

  it('SET_SET 十三個欄位（含 M_A）要全部相符才算確認', () => {
    const tracker = createCommandTracker();
    const expected = [50, 50, 0, 0, 5, 120, 30, 1.0, 1, 0, 0, 0, 80];
    tracker.start(1, 'setSet', expected, 'SET_SET', T0, false);

    tracker.verify(
      reported({ 1: { AL1: 50, AL2: 50, AT: 0, TU: 0, P: 5, I: 120, D: 30, GAIN: 0.5, INT: 1, UNT: 0, DP: 0, M_A: 0, SV: 80 } }),
      T0 + 1000,
    );
    expect(tracker.commands.value[1]?.setSet?.status).toBe('pending'); // GAIN 差超過容差

    tracker.verify(
      reported({ 1: { AL1: 50, AL2: 50, AT: 0, TU: 0, P: 5, I: 120, D: 30, GAIN: 1.0, INT: 1, UNT: 0, DP: 0, M_A: 0, SV: 80 } }),
      T0 + 2000,
    );
    expect(tracker.commands.value[1]?.setSet?.status).toBe('confirmed');
  });

  it('SET_ADVANCED 不做 read-back 比對，只信任 SET_OK/SET_ERROR', () => {
    const tracker = createCommandTracker();
    const expected = [1, 50];
    tracker.start(2, 'setAdvanced', expected, 'SET_ADVANCED', T0, false);

    // 2026-08-14 發現：SET_ADVANCED 現在常常是「沒有要求真的變更」的指令（newStation/RS/BPS/BIT
    // 原樣送回去，controlMode 也可能沒變），下一行回報必然「符合」，跟指令有沒有被韌體接受無關，
    // 會把「被拒絕」誤判成「已回報成功」——見 CHANGELOG.md。因此 verify() 對 setAdvanced 完全不
    // 生效，即使回報值剛好跟 expected 一樣也不會變 confirmed，一定要等 SET_OK/SET_ERROR。
    tracker.verify(
      reported({ 2: { ID: 99, RS: 1, BPS: 19200, BIT: 4, M_A: 1, NUN: 50 } }),
      T0 + 1000,
    );
    expect(tracker.commands.value[2]?.setAdvanced?.status).toBe('pending');
  });
});

describe('offline 時送出指令：不擋，但要標記', () => {
  it('送出當下記錄 offlineAtSend，不影響 read-back 驗證邏輯本身', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, true);
    expect(tracker.commands.value[1]?.run?.offlineAtSend).toBe(true);

    // offline 送出的指令一樣能被之後回報的值確認，不會被卡死
    tracker.verify(reported({ 1: { ON_OFF: 0 } }), T0 + 1000);
    expect(tracker.commands.value[1]?.run?.status).toBe('confirmed');
  });

  it('線上送出的指令 offlineAtSend 為 false', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, false);
    expect(tracker.commands.value[1]?.run?.offlineAtSend).toBe(false);
  });
});

describe('withOfflineNote', () => {
  it('offlineAtSend 為 false 時原樣回傳，不加註記', () => {
    const state = { status: 'pending' as const, requestedText: '運轉', sentAt: T0, resolvedAt: null, offlineAtSend: false, errorText: null };
    const view = { text: '已送出 運轉，等待裝置回報', cls: 'cmd-pending' };
    expect(withOfflineNote(state, view)).toEqual(view);
  });

  it('offlineAtSend 為 true 時加註記並強制轉成警示色，不用等 5 秒逾時', () => {
    const state = { status: 'pending' as const, requestedText: '運轉', sentAt: T0, resolvedAt: null, offlineAtSend: true, errorText: null };
    const view = { text: '已送出 運轉，等待裝置回報', cls: 'cmd-pending' };
    expect(withOfflineNote(state, view)).toEqual({
      text: '已送出 運轉，等待裝置回報（送出當時此燈管已失聯，很可能沒有送達）',
      cls: 'cmd-warn',
    });
  });

  it('已經 confirmed 就不再加註記——裝置後來確實回報相符，代表指令有送達', () => {
    const state = { status: 'confirmed' as const, requestedText: '運轉', sentAt: T0, resolvedAt: T0 + 1000, offlineAtSend: true, errorText: null };
    const view = { text: '裝置已回報 運轉', cls: 'cmd-ok' };
    expect(withOfflineNote(state, view)).toEqual(view);
  });

  it('已經 rejected（韌體明確拒絕）也不再加註記', () => {
    const state = { status: 'rejected' as const, requestedText: '運轉', sentAt: T0, resolvedAt: T0 + 1000, offlineAtSend: true, errorText: '韌體拒絕：NUN 不合法（CODE:2）' };
    const view = { text: '運轉 被裝置拒絕：韌體拒絕：NUN 不合法（CODE:2）', cls: 'cmd-error' };
    expect(withOfflineNote(state, view)).toEqual(view);
  });
});

describe('applyResult', () => {
  it('SET_OK 直接標記為 confirmed，不用等 read-back', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, false);

    tracker.applyResult(1, { kind: 'ok', command: 'MAIN', id: 1 }, T0 + 500);
    expect(tracker.commands.value[1]?.run?.status).toBe('confirmed');
  });

  it('SET_OK 對應到 setSet/setAdvanced 的指令種類', () => {
    const tracker = createCommandTracker();
    tracker.start(2, 'setSet', [1, 2], 'SET_SET', T0, false);
    tracker.start(2, 'setAdvanced', [1], 'SET_ADVANCED', T0, false);

    tracker.applyResult(2, { kind: 'ok', command: 'SET', id: 2 }, T0 + 500);
    expect(tracker.commands.value[2]?.setSet?.status).toBe('confirmed');
    expect(tracker.commands.value[2]?.setAdvanced?.status).toBe('pending'); // 不同種類不受影響
  });

  it('SET_OK 找不到本地 id（id 傳 null）時不會報錯，也不影響任何 pending 指令', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, false);

    tracker.applyResult(null, { kind: 'ok', command: 'MAIN', id: 1 }, T0 + 500);
    expect(tracker.commands.value[1]?.run?.status).toBe('pending');
  });

  it('SET_ERROR 沒有帶 id/command，歸給送出順序最舊的 pending 指令，並附上錯誤說明', () => {
    const tracker = createCommandTracker();
    tracker.start(3, 'setAdvanced', [0, 1], 'SET_ADVANCED', T0, false);

    tracker.applyResult(null, { kind: 'error', param: 'NUN', code: 2, min: null, max: null, raw: 'PARAM:NUN,CODE:2' }, T0 + 500);
    expect(tracker.commands.value[3]?.setAdvanced?.status).toBe('rejected');
    expect(tracker.commands.value[3]?.setAdvanced?.errorText).toBe('韌體拒絕：NUN 不合法（CODE:2）');
  });

  it('SET_ERROR 跳過已經被 read-back 解掉的舊指令，歸給下一筆還在 pending 的', () => {
    const tracker = createCommandTracker();
    tracker.start(1, 'run', [0], '運轉', T0, false);
    tracker.start(2, 'run', [0], '運轉', T0 + 10, false);

    // 1 號先被 read-back 確認掉，佇列裡剩 2 號還是 pending
    tracker.verify(reported({ 1: { ON_OFF: 0 } }), T0 + 100);
    expect(tracker.commands.value[1]?.run?.status).toBe('confirmed');

    tracker.applyResult(null, { kind: 'error', param: null, code: null, min: null, max: null, raw: 'BUSY' }, T0 + 500);
    expect(tracker.commands.value[2]?.run?.status).toBe('rejected');
  });

  it('佇列空了（沒有任何 pending 指令）時 SET_ERROR 安靜地什麼都不做', () => {
    const tracker = createCommandTracker();
    expect(() =>
      tracker.applyResult(null, { kind: 'error', param: null, code: null, min: null, max: null, raw: 'BUSY' }, T0),
    ).not.toThrow();
  });
});
