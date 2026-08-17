import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLampState } from './lampState';

const T0 = 1_700_000_000_000;

describe('資料新鮮度判定', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it('從未收到資料時視為失聯', () => {
    const state = createLampState();
    expect(state.connections.value[1]).toBe('offline');
    expect(state.staleness.value[1]).toBeNull();
  });

  it('剛收到資料為 online，5 秒後 stale，15 秒後 offline', () => {
    const state = createLampState();
    state.applyFields(1, { PV: '75.2' });
    state.tick(T0);
    expect(state.connections.value[1]).toBe('online');

    state.tick(T0 + 4_999);
    expect(state.connections.value[1]).toBe('online');

    state.tick(T0 + 5_000);
    expect(state.connections.value[1]).toBe('stale');

    state.tick(T0 + 14_999);
    expect(state.connections.value[1]).toBe('stale');

    state.tick(T0 + 15_000);
    expect(state.connections.value[1]).toBe('offline');
  });

  it('過期期間仍保留最後的值，不清成 null', () => {
    const state = createLampState();
    state.applyFields(1, { PV: '75.2' });
    state.tick(T0 + 20_000);

    expect(state.connections.value[1]).toBe('offline');
    expect(state.lamps.value[1]?.PV).toBe(75.2);
  });

  it('各台獨立計算，一台失聯不影響其他台', () => {
    const state = createLampState();
    state.applyFields(1, { PV: '75.2' });
    state.applyFields(2, { PV: '78.1' });

    vi.setSystemTime(T0 + 10_000);
    state.applyFields(2, { PV: '78.4' }); // 只有 2 號持續回報
    state.tick(T0 + 10_000);

    expect(state.connections.value[1]).toBe('stale');
    expect(state.connections.value[2]).toBe('online');
  });

  it('只回報 PID 也算這台還活著', () => {
    const state = createLampState();
    state.applyFields(3, { P: '5.0', I: '120', D: '30' });
    state.tick(T0);
    expect(state.connections.value[3]).toBe('online');
  });

  it('解不出任何已知欄位時不更新新鮮度', () => {
    const state = createLampState();
    state.applyFields(4, { foo: 'bar' });
    state.tick(T0);
    expect(state.connections.value[4]).toBe('offline');
  });

  it('重設狀態後回到未收到資料', () => {
    const state = createLampState();
    state.applyFields(1, { PV: '75.2' });
    state.resetStatus();
    state.tick(T0);

    expect(state.connections.value[1]).toBe('offline');
    expect(state.lamps.value[1]?.PV).toBeNull();
  });
});

describe('站號 ↔ 本地 id 對照表', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it('預設站號=id，applyFrames 直接用回報的 ID 當本地 id', () => {
    const state = createLampState();
    state.applyFrames([{ id: 3, fields: { PV: '75.2' } }]);

    expect(state.lamps.value[3]?.PV).toBe(75.2);
    expect(state.getStation(3)).toBe(3);
  });

  it('setStation 後，applyFrames 改用新站號路由回原本那張卡片', () => {
    const state = createLampState();
    state.setStation(3, 5); // 卡片 3 的燈管被改成站號 5

    state.applyFrames([{ id: 5, fields: { PV: '80.1' } }]);
    expect(state.lamps.value[3]?.PV).toBe(80.1);
    expect(state.getStation(3)).toBe(5);
  });

  it('改站號後，舊站號的回報不再路由到任何卡片', () => {
    const state = createLampState();
    state.setStation(3, 5);

    state.applyFrames([{ id: 3, fields: { PV: '99.9' } }]);
    expect(state.lamps.value[3]?.PV).toBeNull();
    expect(state.lamps.value[1]?.PV).toBeNull();
  });

  it('沒有任何卡片認領的站號直接丟棄，不會誤寫進其他卡片', () => {
    const state = createLampState();
    state.applyFrames([{ id: 99, fields: { PV: '1.0' } }]);

    for (const id of [1, 2, 3, 4]) {
      expect(state.lamps.value[id]?.PV).toBeNull();
    }
  });

  it('resetStatus 會把站號表重設回 identity', () => {
    const state = createLampState();
    state.setStation(3, 5);
    state.resetStatus();

    expect(state.getStation(3)).toBe(3);
    state.applyFrames([{ id: 3, fields: { PV: '70.0' } }]);
    expect(state.lamps.value[3]?.PV).toBe(70.0);
  });
});
