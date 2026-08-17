import { createSimulator } from './simulator';
import { LAMP_IDS } from './constants';

/**
 * 開發模式(?fakeserial=1)用的假 navigator.serial:無硬體演練完整連線流程。
 * 瀏覽器主控台可用 window.__fakeSerial 操作:
 *   __fakeSerial.unplug()      模擬拔線
 *   __fakeSerial.cancelNext()  讓下一次 requestPort 走「使用者取消」路徑
 */
export function installFakeWebSerial() {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let readController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const simulator = createSimulator({
    onLine: line => enqueueChunked(line + '\n'),
    onNotice: (_type, message) => console.info('[fakeserial]', message),
  });

  // 真實串列資料會被切成任意大小的片段抵達,一行拆成數個 chunk 才測得到斷行緩衝
  const enqueueChunked = (text: string) => {
    if (!readController) return;
    const bytes = encoder.encode(text);
    let offset = 0;
    while (offset < bytes.length) {
      const size = Math.max(1, Math.ceil((Math.random() * bytes.length) / 2));
      readController.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    }
  };

  // 站號 0 = 廣播；模擬器裡站號就是本地 id（尚未被 SET_ADVANCED 改過時）
  const targetIds = (station: number) => (station === 0 ? [...LAMP_IDS] : LAMP_IDS.includes(station) ? [station] : []);

  /**
   * 指令格式見 docs/PROTOCOL.md v4 草案：`CMD(參數1,參數2,...)`，一行一個指令。
   * v4 把 SET_SET 改名 SET_PARAMETER、SV/M_A/NUN 收進 SET_MAIN，見 commands.ts 的
   * SetMainParams/SetParameterParams 說明。
   */
  const handleCommand = (line: string) => {
    const match = line.trim().match(/^([A-Z_]+)\(([^)]*)\)$/);
    if (!match) return; // 無法解析的行直接忽略(協定規定)

    const [, cmd, argsText] = match;
    const args = (argsText ?? '').split(',');
    const [stationText, ...rest] = args;
    const ids = targetIds(Number(stationText));
    if (!ids.length) return;

    for (const id of ids) {
      switch (cmd) {
        case 'SET_MAIN':
          simulator.setMain(id, {
            on: rest[0] === '0', // ON:0/OFF:1
            sv: Number(rest[1]),
            controlMode: Number(rest[2]),
            nUn: Number(rest[3]),
          });
          break;
        case 'SET_PARAMETER':
          simulator.setParameter(id, {
            sensorType: Number(rest[0]),
            unit: Number(rest[1]),
            decimal: Number(rest[2]),
            sht: Number(rest[3]),
            autoTune: Number(rest[4]),
            offset: Number(rest[5]),
            p: Number(rest[6]),
            i: Number(rest[7]),
            d: Number(rest[8]),
            gain: Number(rest[9]),
            al1: Number(rest[10]),
            al2: Number(rest[11]),
          });
          break;
        case 'SET_ADVANCED':
          simulator.setAdvanced(id, {
            newStation: Number(rest[0]),
            commMode: Number(rest[1]),
            baudRate: Number(rest[2]),
            format: Number(rest[3]),
          });
          break;
      }
    }
  };

  const port = {
    readable: null as ReadableStream<Uint8Array> | null,
    writable: null as WritableStream<Uint8Array> | null,

    async open(_options: { baudRate: number }) {
      this.readable = new ReadableStream<Uint8Array>({
        start: controller => {
          readController = controller;
        },
        cancel: () => {
          readController = null;
        },
      });

      let commandBuffer = '';
      this.writable = new WritableStream<Uint8Array>({
        write: chunk => {
          commandBuffer += decoder.decode(chunk, { stream: true });
          const lines = commandBuffer.split(/\r?\n/);
          commandBuffer = lines.pop() ?? '';
          for (const cmdLine of lines) {
            if (cmdLine.trim()) handleCommand(cmdLine.trim());
          }
        },
      });

      simulator.start(false);
    },

    async close() {
      simulator.stop();
      readController = null;
      this.readable = null;
      this.writable = null;
    },
  };

  const grantedPorts: any[] = [];
  const disconnectListeners = new Set<(event: Event) => void>();
  let cancelNextRequest = false;

  const fakeSerial = {
    async getPorts() {
      return [...grantedPorts];
    },
    async requestPort() {
      await new Promise(resolve => setTimeout(resolve, 300)); // 模擬選埠視窗的等待
      if (cancelNextRequest) {
        cancelNextRequest = false;
        throw new DOMException('No port selected by the user.', 'NotFoundError');
      }
      if (!grantedPorts.includes(port)) grantedPorts.push(port);
      return port;
    },
    addEventListener(type: string, listener: (event: Event) => void) {
      if (type === 'disconnect') disconnectListeners.add(listener);
    },
    removeEventListener(_type: string, listener: (event: Event) => void) {
      disconnectListeners.delete(listener);
    },
  };

  // 真瀏覽器的 navigator.serial 是 prototype 上的 getter-only 屬性,直接賦值會炸;
  // 在實例上定義 own property 把它遮蔽掉
  Object.defineProperty(navigator, 'serial', { value: fakeSerial, configurable: true });

  (window as any).__fakeSerial = {
    unplug() {
      simulator.stop();
      readController?.close(); // 讀取端收到 done,readLoop 結束
      readController = null;
      grantedPorts.length = 0; // 拔掉後 getPorts 不應再列出
      for (const listener of disconnectListeners) listener(new Event('disconnect'));
    },
    cancelNext() {
      cancelNextRequest = true;
    },
  };

  console.info('[fakeserial] 已偽造 navigator.serial,「連線裝置」會連上內建假 Arduino');
}
