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

// v4 草案：SV/M_A/NUN 收進 SET_MAIN，SET_SET 改名 SET_PARAMETER 且拿掉 M_A/SV、新增 SHT，
// 見 commands.ts 的 SetMainParams/SetParameterParams 說明。
const DEFAULT_PARAMETER: Parameters<ReturnType<typeof createSimulator>['setParameter']>[1] = {
  al1: 50, al2: 50, autoTune: 0, offset: 0, p: 5, i: 120, d: 30, gain: 1.0,
  sensorType: 1, unit: 0, decimal: 0, sht: 0,
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

  it('SET_MAIN 寫入的 SV 會由回報值反映出來', () => {
    const { state, simulator } = wire();
    simulator.start(true);
    vi.advanceTimersByTime(1000);

    simulator.setMain(2, { on: true, sv: 95, controlMode: 0, nUn: -1 });
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

    simulator.setMain(3, { on: false, sv: 80, controlMode: 0, nUn: -1 });
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
    simulator.setAdvanced(4, { newStation: 40, commMode: 0, baudRate: 0, format: 2 });
    vi.advanceTimersByTime(1000);

    expect(state.lamps.value[4]?.ID).toBe(40);
    simulator.stop();
  });

  it('SET_ADVANCED 的 baudRate 索引 1 (19200) 回報時是實際 bps，不是索引本身', () => {
    const { state, simulator } = wire();
    simulator.start(false);
    vi.advanceTimersByTime(1000);

    simulator.setAdvanced(1, { newStation: 1, commMode: 0, baudRate: 1, format: 2 });
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

    tracker.start(1, 'main', [0, 80, 0, -1], '運轉', Date.now(), false);
    simulator.setMain(1, { on: true, sv: 80, controlMode: 0, nUn: -1 });
    vi.advanceTimersByTime(0); // 讓 emitResult 的 setTimeout(0) 觸發

    expect(tracker.commands.value[1]?.main?.status).toBe('confirmed');
    simulator.stop();
  });

  it('SET_PARAMETER 送出後回 SET_OK', () => {
    const { tracker, simulator } = wire();
    simulator.start(false);
    vi.advanceTimersByTime(1000);

    tracker.start(2, 'setParameter', [1, 0, 0, 0, 0, 0, 5, 120, 30, 1, 50, 50], 'SET_PARAMETER', Date.now(), false);
    simulator.setParameter(2, DEFAULT_PARAMETER);
    vi.advanceTimersByTime(0);

    expect(tracker.commands.value[2]?.setParameter?.status).toBe('confirmed');
    simulator.stop();
  });

  it('SET_ADVANCED 送出後回 SET_OK——v4 草案不再驗證 NUN，那個欄位已經移去 SET_MAIN，見 docs/DEVICE-CHECKLIST.md H1', () => {
    const { tracker, simulator } = wire();
    simulator.start(false);
    vi.advanceTimersByTime(1000);

    tracker.start(3, 'setAdvanced', [3, 0, 9600, 2], 'SET_ADVANCED', Date.now(), false);
    simulator.setAdvanced(3, { newStation: 3, commMode: 0, baudRate: 0, format: 2 });
    vi.advanceTimersByTime(0);

    expect(tracker.commands.value[3]?.setAdvanced?.status).toBe('confirmed');
    simulator.stop();
  });
});
