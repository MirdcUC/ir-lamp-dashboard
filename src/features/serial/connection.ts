export interface SerialConnectionOptions {
  baudRate: number;
  /** 收到一行完整資料（已去掉換行）時呼叫 */
  onLine: (line: string) => void;
  /** 裝置被實體拔除時呼叫 */
  onUnplugged: () => void;
}

/** 瀏覽器不支援 Web Serial（非 Chrome/Edge，或不是 localhost/HTTPS）時由 open() 拋出 */
export class SerialUnsupportedError extends Error {}

/** 使用者在埠選擇視窗按取消時由 open() 拋出；不是錯誤，呼叫端靜默處理即可 */
export class SerialCancelledError extends Error {}

// HTTP（非 localhost）部署時 navigator 上根本沒有 serial，同一個檢查同時涵蓋瀏覽器與安全來源
export const isSerialSupported = () => 'serial' in navigator;

/**
 * Web Serial 連線與收發。
 * 只負責搬字串進出，不認識協定內容，格式解析交給 protocol/ 的 adapter。
 */
export function createSerialConnection(options: SerialConnectionOptions) {
  let port: any = null;
  let reader: ReadableStreamDefaultReader<string> | null = null;
  let writer: WritableStreamDefaultWriter<string> | null = null;
  let readableStreamClosed: Promise<void> | null = null;
  let writableStreamClosed: Promise<void> | null = null;
  let opened = false;
  let isReading = false;

  const handleUnplug = () => {
    opened = false;
    options.onUnplugged();
  };

  const readLoop = async () => {
    if (isReading) return;
    isReading = true;

    const textDecoder = new TextDecoderStream();
    readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    reader = textDecoder.readable.getReader();

    let buffer = ''; // 暫存資料片段

    try {
      while (port?.readable) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!opened) break;

        if (value) {
          buffer += value;

          // 當遇到換行符號（\r\n 或 \n），表示一筆完整資料
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || ''; // 保留未完整的一段（可能被切開）

          for (const line of lines) {
            if (line.trim()) options.onLine(line);
          }
        }
      }
    } catch (err) {
      console.warn('讀取中斷:', err);
    } finally {
      reader?.releaseLock();
      isReading = false;
    }
  };

  const open = async () => {
    if (!isSerialSupported()) {
      throw new SerialUnsupportedError('瀏覽器不支援 Web Serial API');
    }
    const serial = (navigator as any).serial;

    // 拔線路徑不會走 close(),port 可能殘留上一次的物件;不歸零會跳過重新開埠,
    // 直接 pipe 到已被舊 writer 鎖住的串流
    port = null;

    // 之前授權過且目前接上的埠恰好一個時直接沿用，現場不用每次面對 COM 清單；
    // 開埠失敗（例如被其他程式佔用）就退回選擇視窗
    const granted = await serial.getPorts();
    if (granted.length === 1) {
      try {
        port = granted[0];
        await port.open({ baudRate: options.baudRate });
      } catch {
        port = null;
      }
    }

    if (!port) {
      try {
        port = await serial.requestPort();
      } catch (err) {
        if ((err as DOMException)?.name === 'NotFoundError') {
          throw new SerialCancelledError('未選擇串列埠');
        }
        throw err;
      }
      await port.open({ baudRate: options.baudRate });
    }

    const textEncoder = new TextEncoderStream();
    writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
    writer = textEncoder.writable.getWriter();

    opened = true;
    (navigator as any).serial.addEventListener('disconnect', handleUnplug);

    // Arduino 會主動定時回報狀態，連線後直接啟動讀取
    readLoop();
  };

  const write = async (text: string) => {
    if (!writer) throw new Error('尚未連線');
    await writer.write(text + '\n');
  };

  const close = async () => {
    opened = false;
    (navigator as any).serial?.removeEventListener('disconnect', handleUnplug);

    if (reader) {
      try {
        await reader.cancel();
      } catch (_) {
        /* 讀取已停止 */
      }
      reader.releaseLock();
      reader = null;
    }

    if (writer) {
      try {
        await writer.close();
      } catch (_) {
        /* 某些瀏覽器不支援 close() */
      }
      writer.releaseLock();
      writer = null;
    }

    // 等待 pipeTo 完成
    if (readableStreamClosed) {
      try {
        await readableStreamClosed;
      } catch (_) {
        /* Stream 可能已被取消 */
      }
      readableStreamClosed = null;
    }

    if (writableStreamClosed) {
      try {
        await writableStreamClosed;
      } catch (_) {
        /* Stream 可能已被取消 */
      }
      writableStreamClosed = null;
    }

    if (port && typeof port.close === 'function') {
      await port.close();
    }
    port = null;
    isReading = false;
  };

  return {
    open,
    write,
    close,
    get port() {
      return port;
    },
  };
}
