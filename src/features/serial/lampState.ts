import { computed, ref, type Ref } from 'vue';
import type { LampConnection, LampStatus } from './types';
import {
  LAMP_FIELD_KEYS,
  LAMP_IDS,
  OFFLINE_AFTER_MS,
  STALE_AFTER_MS,
  buildLampMap,
  initLampStatus,
} from './constants';
import type { ParsedFrame } from './protocol';

/** 四支燈管的即時狀態與資料新鮮度；實機與模擬資料都經由 applyFrames 進來 */
export function createLampState() {
  const lamps: Ref<Record<number, LampStatus>> = ref(buildLampMap(initLampStatus));
  const lastUpdatedAt: Ref<Record<number, number | null>> = ref(buildLampMap<number | null>(null));

  /**
   * 本地燈管 id（UI 卡片/分頁）↔ 燈管目前回報的設定站號，預設站號=id。
   * 進階設定把某支燈管的站號改掉之後，兩者會分開；`applyFrames` 靠這張表把回報的站號
   * 路由回原本那張卡片，`setStation` 則在送出 SET_ADVANCED 當下同步更新，見待辦「站號 vs 本地 id」。
   */
  const identityStationMap = () => new Map<number, number>(LAMP_IDS.map(id => [id, id]));
  let stationOfLamp = identityStationMap();
  let lampIdOfStation = identityStationMap();

  const setStation = (lampId: number, station: number) => {
    const prevStation = stationOfLamp.get(lampId);
    if (prevStation !== undefined) lampIdOfStation.delete(prevStation);
    stationOfLamp.set(lampId, station);
    lampIdOfStation.set(station, lampId);
  };

  /** 這張卡片目前已知的站號；還沒被 setStation 改過的話等於 lampId 本身 */
  const getStation = (lampId: number) => stationOfLamp.get(lampId) ?? lampId;

  /**
   * 反查：站號目前對應哪張卡片的本地 id；查不到回傳 undefined。
   * 給 `SET_OK` 回覆行用（見 setResult.ts）——那行只帶站號，要轉成本地 id 才能對到
   * commandTracker 用本地 id 記錄的那筆指令。
   */
  const getLampId = (station: number) => lampIdOfStation.get(station);

  // 新鮮度會隨時間變化，需要一個會前進的時間來源才能讓畫面自己變色
  const now = ref(Date.now());

  const applyFields = (id: number, fields: Record<string, string>) => {
    const current = lamps.value[id];
    if (!current) return;

    const status = { ...current };
    let changed = false;
    for (const key of LAMP_FIELD_KEYS) {
      const raw = fields[key];
      if (raw === undefined) continue;

      const num = Number(raw);
      if (!Number.isNaN(num)) {
        status[key] = num;
        changed = true;
      }
    }
    if (changed) {
      lamps.value = { ...lamps.value, [id]: status };
      lastUpdatedAt.value = { ...lastUpdatedAt.value, [id]: Date.now() };
    }
  };

  /**
   * frame.id 是回報帶的站號；查表轉成本地 id 才能寫入 `lamps`。
   * 查不到（站號還沒被任何卡片認領）就整筆丟棄。
   */
  const applyFrames = (frames: ParsedFrame[]) => {
    for (const frame of frames) {
      const lampId = lampIdOfStation.get(frame.id);
      if (lampId === undefined) continue;
      applyFields(lampId, frame.fields);
    }
  };

  const connections = computed<Record<number, LampConnection>>(() => {
    const result: Record<number, LampConnection> = {};
    for (const id of LAMP_IDS) {
      const last = lastUpdatedAt.value[id];
      if (last === null || last === undefined) {
        result[id] = 'offline';
        continue;
      }
      const age = now.value - last;
      result[id] = age >= OFFLINE_AFTER_MS ? 'offline' : age >= STALE_AFTER_MS ? 'stale' : 'online';
    }
    return result;
  });

  /** 距離最後一次回報過了幾毫秒；從未收到資料為 null */
  const staleness = computed<Record<number, number | null>>(() => {
    const result: Record<number, number | null> = {};
    for (const id of LAMP_IDS) {
      const last = lastUpdatedAt.value[id];
      result[id] = last === null || last === undefined ? null : now.value - last;
    }
    return result;
  });

  return {
    lamps,
    lastUpdatedAt,
    connections,
    staleness,
    applyFields,
    applyFrames,
    setStation,
    getStation,
    getLampId,
    /** 由外部的計時器推進，讓新鮮度會自己隨時間退化 */
    tick: (timestamp: number) => {
      now.value = timestamp;
    },
    resetStatus: () => {
      lamps.value = buildLampMap(initLampStatus);
      lastUpdatedAt.value = buildLampMap<number | null>(null);
      stationOfLamp = identityStationMap();
      lampIdOfStation = identityStationMap();
    },
  };
}
