import { ref, type Ref } from 'vue';
import type { LampStatus } from './types';
import { COMMAND_CLEAR_MS, COMMAND_TOLERANCE, COMMAND_TIMEOUT_MS } from './constants';
import { describeSetError, type SetResult, type SetResultCommand } from './protocol/setResult';

export type CommandType = 'run' | 'setSet' | 'setAdvanced';

/**
 * pending    已送出，等待回報值變化
 * confirmed  回報值已與要求值相符，或韌體回了 SET_OK
 * unconfirmed 逾時仍未相符；代表結果未知，不等於裝置沒執行
 * sent       已送出但本質上無法驗證
 * rejected   韌體回了 SET_ERROR，指令被拒絕、確定沒有執行——見 applyResult 的說明
 */
export type CommandStatus = 'pending' | 'confirmed' | 'unconfirmed' | 'sent' | 'rejected';

export interface CommandState {
  status: CommandStatus;
  /** 顯示用的要求值 */
  requestedText: string;
  sentAt: number;
  resolvedAt: number | null;
  /**
   * 送出當下這支燈管是否已失聯（見待辦「offline 時是否禁止下控制命令」的結論：
   * 不擋送出，但要讓使用者清楚知道這道指令當下很可能沒有聽眾）。
   */
  offlineAtSend: boolean;
  /** status 為 rejected 時，韌體 SET_ERROR 回覆的說明文字；其餘狀態一律為 null */
  errorText: string | null;
}

/**
 * 統一在「等待回報」「逾時未確認」「無法驗證」三種狀態外加一句offline警示，並強制轉成警示色——
 * 不用等 5 秒逾時才提醒，送出當下已失聯就立刻讓使用者知道「這道指令很可能沒送達」，
 * 跟「已送出但單純還沒確認」是不同等級的風險，見 LampCard.vue／settingsShared.ts／Dashboard.vue 共用。
 * confirmed/rejected 都是韌體給過明確答案的終態，不用再加這句offline註記。
 */
export function withOfflineNote(
  state: CommandState,
  view: { text: string; cls: string },
): { text: string; cls: string } {
  if (!state.offlineAtSend || state.status === 'confirmed' || state.status === 'rejected') return view;
  return { text: `${view.text}（送出當時此燈管已失聯，很可能沒有送達）`, cls: 'cmd-warn' };
}

type CommandMap = Record<number, Partial<Record<CommandType, CommandState>>>;

/** 取出該指令要拿來比對的回報值；回傳 null 代表本型別不做比對 */
function reportedValues(type: CommandType, lamp: LampStatus | undefined): (number | null)[] | null {
  if (!lamp) return null;
  switch (type) {
    case 'run':
      return [lamp.ON_OFF]; // ON_OFF：0=ON 1=OFF，跟 store.setRun 送出的 expected 值同一套編碼
    // 欄位順序對應 SET_SET/SET_ADVANCED 指令參數；設定站號（newID）不比對——
    // 改站號可能讓這支燈管之後改用別的 ID 回報，見待確認事項第 1 條
    case 'setSet':
      // M_A 這個位置是否真的屬於 SET_SET 還在實測中，見 commands.ts 的 SetSetParams 說明
      return [lamp.AL1, lamp.AL2, lamp.AT, lamp.TU, lamp.P, lamp.I, lamp.D, lamp.GAIN, lamp.INT, lamp.UNT, lamp.DP, lamp.M_A, lamp.SV];
    case 'setAdvanced':
      // 不做 read-back 比對，只信任 SET_OK/SET_ERROR（見 applyResult）——2026-08-14 現場實測
      // 發現：SET_ADVANCED 現在會把 newStation/RS/BPS/BIT 原樣送回去、controlMode 常常也沒變，
      // 這種「沒有要求真的變更」的指令，下一行回報必然「符合」，跟指令有沒有被韌體接受無關，
      // 會把「被 SET_ERROR 拒絕」誤判成「已回報成功」。見 CHANGELOG.md。
      return null;
  }
}

const RESULT_COMMAND_TO_TYPE: Record<SetResultCommand, CommandType> = {
  MAIN: 'run',
  SET: 'setSet',
  ADVANCED: 'setAdvanced',
};

/**
 * 追蹤每支燈管每種指令的結果。
 * 協定原本沒有 ACK，唯一的判斷依據是「下一輪回報的值有沒有變成要求值」；後來確認韌體其實
 * 會回 `SET_OK`/`SET_ERROR`（見 protocol/setResult.ts），因此 confirmed 除了 read-back 比對
 * 相符，也可能是韌體直接回了 SET_OK；rejected 則是韌體明確拒絕，不用等 read-back 或逾時。
 */
export function createCommandTracker() {
  const commands: Ref<CommandMap> = ref({});
  // 要求值不放進 commands，避免只為了比對就讓 UI 依賴的物件變複雜
  const expectations = new Map<string, number[]>();

  /**
   * 送出順序的佇列，只給 applyResult 處理 SET_ERROR 用——SET_ERROR 沒有帶站號也沒有帶指令種類
   * （見 protocol/setResult.ts），沒辦法像 SET_OK 一樣直接對應。RS-485 匯流排一次只能有一問一答
   * （見 PROTOCOL.md），因此退而求其次：假設回覆一定是按送出順序回來，錯誤就歸給目前還在 pending
   * 的最舊一筆。這只是盡力而為的近似值，不是韌體保證的行為。
   */
  const pendingQueue: { id: number; type: CommandType }[] = [];

  const put = (id: number, type: CommandType, state: CommandState) => {
    commands.value = {
      ...commands.value,
      [id]: { ...commands.value[id], [type]: state },
    };
  };

  /** 記錄一道剛送出的指令；expected 為空陣列代表無法驗證 */
  const start = (
    id: number,
    type: CommandType,
    expected: number[],
    requestedText: string,
    timestamp: number,
    offlineAtSend: boolean,
  ) => {
    expectations.set(`${id}:${type}`, expected);
    const verifiable = expected.length > 0;
    put(id, type, {
      status: verifiable ? 'pending' : 'sent',
      requestedText,
      sentAt: timestamp,
      resolvedAt: verifiable ? null : timestamp,
      offlineAtSend,
      errorText: null,
    });
    if (verifiable) pendingQueue.push({ id, type });
  };

  /** 收到新回報時比對所有 pending 指令 */
  const verify = (lamps: Record<number, LampStatus>, timestamp: number) => {
    for (const [rawId, byType] of Object.entries(commands.value)) {
      const id = Number(rawId);
      for (const [rawType, state] of Object.entries(byType)) {
        if (state.status !== 'pending') continue;

        const type = rawType as CommandType;
        const expected = expectations.get(`${id}:${type}`);
        const reported = reportedValues(type, lamps[id]);
        if (!expected || !reported) continue;

        const matched = expected.every((want, idx) => {
          const got = reported[idx];
          return got !== null && got !== undefined && Math.abs(got - want) <= COMMAND_TOLERANCE;
        });
        if (matched) {
          put(id, type, { ...state, status: 'confirmed', resolvedAt: timestamp });
        }
      }
    }
  };

  /**
   * 套用 `SET_OK`/`SET_ERROR` 回覆行的結果（見 protocol/setResult.ts）。
   * SET_OK 帶了站號＋指令種類，可以直接對應到 pending 的那一筆，立刻標記為 confirmed，
   * 不用等下一輪 read-back。SET_ERROR 沒有這些資訊，走 pendingQueue 的近似對應（見上方說明）。
   * `id` 一律是本地燈管 id，不是協定裡的站號——呼叫端（store.ts）要先用站號表轉換過。
   */
  const applyResult = (id: number | null, result: SetResult, timestamp: number) => {
    if (result.kind === 'ok') {
      if (id === null) return; // 站號沒能對應回任何一張卡片，見 store.ts 的轉換
      const type = RESULT_COMMAND_TO_TYPE[result.command];
      const state = commands.value[id]?.[type];
      const queueIdx = pendingQueue.findIndex(e => e.id === id && e.type === type);
      if (queueIdx !== -1) pendingQueue.splice(queueIdx, 1);
      if (state?.status === 'pending') {
        put(id, type, { ...state, status: 'confirmed', resolvedAt: timestamp });
      }
      return;
    }

    // SET_ERROR：找 pendingQueue 裡最舊、目前仍是 pending 的一筆（可能已經被 read-back 解掉，跳過繼續找）
    while (pendingQueue.length > 0) {
      const entry = pendingQueue.shift()!;
      const state = commands.value[entry.id]?.[entry.type];
      if (state?.status !== 'pending') continue;
      put(entry.id, entry.type, {
        ...state,
        status: 'rejected',
        resolvedAt: timestamp,
        errorText: describeSetError(result),
      });
      return;
    }
  };

  /** 由計時器推進：處理逾時，並清掉已經顯示夠久的提示 */
  const tick = (timestamp: number) => {
    let next: CommandMap | null = null;
    const mutate = () => (next ??= structuredCloneMap(commands.value));

    for (const [rawId, byType] of Object.entries(commands.value)) {
      const id = Number(rawId);
      for (const [rawType, state] of Object.entries(byType)) {
        const type = rawType as CommandType;

        if (state.status === 'pending') {
          if (timestamp - state.sentAt >= COMMAND_TIMEOUT_MS) {
            const target = mutate();
            target[id]![type] = { ...state, status: 'unconfirmed', resolvedAt: timestamp };
          }
          continue;
        }
        // unconfirmed/rejected 代表結果未知或明確失敗，留在畫面上直到下一道同型指令覆蓋，不自動消失
        if (state.status === 'unconfirmed' || state.status === 'rejected' || state.resolvedAt === null) continue;

        if (timestamp - state.resolvedAt >= COMMAND_CLEAR_MS) {
          const target = mutate();
          delete target[id]![type];
          expectations.delete(`${id}:${type}`);
        }
      }
    }
    if (next) commands.value = next;
  };

  return {
    commands,
    start,
    verify,
    applyResult,
    tick,
    reset: () => {
      commands.value = {};
      expectations.clear();
      pendingQueue.length = 0;
    },
  };
}

function structuredCloneMap(map: CommandMap): CommandMap {
  const copy: CommandMap = {};
  for (const [id, byType] of Object.entries(map)) copy[Number(id)] = { ...byType };
  return copy;
}
