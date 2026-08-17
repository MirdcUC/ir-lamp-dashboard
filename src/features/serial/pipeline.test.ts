import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLampState } from './lampState';
import { createProtocolDecoder } from './protocol';
import { parseSetResult } from './protocol/setResult';
import { createCommandTracker } from './commandTracker';
import { createSimulator } from './simulator';
import { LAMP_IDS } from './constants';

/** 照 store.ts 的 handleLine 接法把模擬器、解析器、指令追蹤全部串起來 */
function wire() {
  const state = createLampState();
  const decoder = createProtocolDecoder();
  const tracker = createCommandTracker();
  const simulator = createSimulator({
    onLine: line => {
      const setResult = parseSetResult(line);
      if (setResult) {
        const lampId = setResult.kind === 'ok' ? (state.getLampId(setResult.id) ?? null) : null;
        tracker.applyResult(lampId, setResult, Date.now());
        return;
      }
      state.applyFrames(decoder.decode(line).frames);
      tracker.verify(state.lamps.value, Date.now());
    },
    onNotice: () => {},
  });
  return { state, decoder, tracker, simulator };
}

const DEFAULT_SET: Parameters<ReturnType<typeof createSimulator>['setSet']>[1] = {
  al1: 50, al2: 50, autoTune: 0, offset: 0, p: 5, i: 120, d: 30, gain: 1.0,
  sensorType: 1, unit: 0, decimal: 0, sv: 95,
};

describe('模擬器 → 解析 → 燈管狀態', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('每輪吐出括號包住的一行，state 會拿到資料', () => {
    const { state, decoder, simulator } = wire();
    simulator.start(true);
    vi.advanceTimersByTime(1000);

    expect(decoder.activeAdapter).toBe('paren-field23');
    for (const id of LAMP_IDS) {
      const lamp = state.lamps.value[id];
      expect(lamp?.PV).toBeTypeOf('number');
      expect(lamp?.SV).toBe(80);
      expect(lamp?.ON_OFF).toBe(0); // ON:0，autoRun=true 一開始就是運轉中
    }
    simulator.stop();
  });

  it('SET_SET 寫入的 SV 會由回報值反映出來', () => {
    const { state, simulator } = wire();
    simulator.start(true);
    vi.advanceTimersByTime(1000);

    simulator.setSet(2, { ...DEFAULT_SET, sv: 95 });
    vi.advanceTimersByTime(1000);

    expect(state.lamps.value[2]?.SV).toBe(95);
    expect(state.lamps.value[1]?.SV).toBe(80); // 只影響指定那支
    simulator.stop();
  });

  it('PID 一直都在同一行回報，不需要另外的讀取指令', () => {
    const { state, simulator } = wire();
    simulator.start(false);
    vi.advanceTimersByTime(1000);

    expect(state.lamps.value[1]?.P).toBe(5);
    expect(state.lamps.value[1]?.I).toBe(120);
    expect(state.lamps.value[1]?.D).toBe(30);
    simulator.stop();
  });

  it('停止運轉後輸出歸零', () => {
    const { state, simulator } = wire();
    simulator.start(true);
    vi.advanceTimersByTime(3000);

    simulator.setRun(3, false);
    vi.advanceTimersByTime(1000);

    expect(state.lamps.value[3]?.ON_OFF).toBe(1); // OFF:1
    expect(state.lamps.value[3]?.UN).toBe(0);
    simulator.stop();
  });

  it('SET_ADVANCED 改站號後，回報行帶新站號也能路由回同一張卡片', () => {
    const { state, simulator } = wire();
    simulator.start(false);
    vi.advanceTimersByTime(1000);

    state.setStation(4, 40);
    // 自動模式（controlMode:0）NUN 必須是 -1，不然會被模擬器當成 SET_ERROR 整道拒絕，見下面 describe('SET_ERROR/SET_OK')
    simulator.setAdvanced(4, { newStation: 40, commMode: 0, baudRate: 0, format: 2, controlMode: 0, nUn: -1 });
    vi.advanceTimersByTime(1000);

    expect(state.lamps.value[4]?.ID).toBe(40);
    simulator.stop();
  });

  it('SET_ADVANCED 的 baudRate 索引 1 (19200) 回報時是實際 bps，不是索引本身', () => {
    const { state, simulator } = wire();
    simulator.start(false);
    vi.advanceTimersByTime(1000);

    simulator.setAdvanced(1, { newStation: 1, commMode: 0, baudRate: 1, format: 2, controlMode: 0, nUn: -1 });
    vi.advanceTimersByTime(1000);

    expect(state.lamps.value[1]?.BPS).toBe(19200);
    simulator.stop();
  });
});

describe('SET_OK / SET_ERROR 回覆行', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('SET_MAIN 送出後，模擬器回 SET_OK，指令立刻變 confirmed（不用等 read-back）', () => {
    const { tracker, simulator } = wire();
    simulator.start(false);
    vi.advanceTimersByTime(1000);

    tracker.start(1, 'run', [0], '運轉', Date.now(), false);
    simulator.setRun(1, true);
    vi.advanceTimersByTime(0); // 讓 emitResult 的 setTimeout(0) 觸發

    expect(tracker.commands.value[1]?.run?.status).toBe('confirmed');
    simulator.stop();
  });

  it('SET_SET 送出後回 SET_OK', () => {
    const { tracker, simulator } = wire();
    simulator.start(false);
    vi.advanceTimersByTime(1000);

    tracker.start(2, 'setSet', [50, 50, 0, 0, 5, 120, 30, 1, 1, 0, 0, 95], 'SET_SET', Date.now(), false);
    simulator.setSet(2, DEFAULT_SET);
    vi.advanceTimersByTime(0);

    expect(tracker.commands.value[2]?.setSet?.status).toBe('confirmed');
    simulator.stop();
  });

  it('自動模式下送 NUN 不是 -1，模擬器回 SET_ERROR，指令立刻變 rejected 並帶錯誤說明', () => {
    const { tracker, simulator } = wire();
    simulator.start(false);
    vi.advanceTimersByTime(1000);

    tracker.start(3, 'setAdvanced', [0, 0], 'SET_ADVANCED', Date.now(), false);
    simulator.setAdvanced(3, { newStation: 3, commMode: 0, baudRate: 0, format: 2, controlMode: 0, nUn: 0 });
    vi.advanceTimersByTime(0);

    expect(tracker.commands.value[3]?.setAdvanced?.status).toBe('rejected');
    expect(tracker.commands.value[3]?.setAdvanced?.errorText).toBe('韌體拒絕：NUN 不合法（CODE:2）');
    simulator.stop();
  });

  it('SET_ADVANCED 帶合法 NUN（自動模式送 -1）時回 SET_OK', () => {
    const { tracker, simulator } = wire();
    simulator.start(false);
    vi.advanceTimersByTime(1000);

    tracker.start(4, 'setAdvanced', [0, -1], 'SET_ADVANCED', Date.now(), false);
    simulator.setAdvanced(4, { newStation: 4, commMode: 0, baudRate: 0, format: 2, controlMode: 0, nUn: -1 });
    vi.advanceTimersByTime(0);

    expect(tracker.commands.value[4]?.setAdvanced?.status).toBe('confirmed');
    simulator.stop();
  });
});
