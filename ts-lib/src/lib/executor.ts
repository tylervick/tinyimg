import wasmUrl from '../wasm/tinyimg.wasm?no-inline';

export type TaskResult<O, E extends Error = Error> =
  | {
      id: string;
      data: O;
      error?: undefined;
    }
  | {
      id: string;
      error: E;
      data?: undefined;
    };

export type EventTask<I, O> = {
  type: string;
  id: string;
  input: I;
  result: TaskResult<O>;
};

export type InitTask = EventTask<WebAssembly.Module, void> & {
  type: 'init';
};

export type ConvertTask = EventTask<SharedArrayBuffer, Blob> & {
  type: 'convert';
};

export type Task = InitTask | ConvertTask;

export default class WorkerExecutor {
  private initialized = false;
  private worker: Worker | null = null;

  constructor() {}

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const module = await WebAssembly.compileStreaming(fetch(wasmUrl));
    this.worker = new Worker(
      new URL('../worker/wasm-worker.ts', import.meta.url),
      { type: 'module' }
    );
    await this.sendToWorker({
      type: 'init',
      input: module,
    } as InitTask);
    this.initialized = true;
  }

  private async sendToWorker<I, O>(event: EventTask<I, O>): Promise<O> {
    const eventId = crypto.randomUUID();
    event.id = eventId;

    return new Promise<O>((resolve, reject) => {
      if (!this.worker) {
        throw new Error('Worker not initialized');
      }
      const messageHandler = (e: MessageEvent<TaskResult<O>>) => {
        const { data, error, id } = e.data;

        if (id !== eventId) {
          return;
        }

        this.worker?.removeEventListener('message', messageHandler);

        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      };

      this.worker.addEventListener('message', messageHandler);

      this.worker.postMessage(event);
    });
  }

  public async streamTiffToJpeg(file: File): Promise<Blob> {
    if (!crossOriginIsolated) {
      throw new Error('Cross-origin isolation is not enabled');
    }
    const sharedArrayBuffer = new SharedArrayBuffer(file.size);
    const sharedArray = new Uint8Array(sharedArrayBuffer);

    await readFileIntoBuffer(file, sharedArray);

    const wk = await this.sendToWorker({
      type: 'convert',
      input: sharedArrayBuffer,
    } as ConvertTask);

    return wk;
  }
}

// TODO: It might be more efficient to pass the File to the worker (as a transferable object) first,
// So that the memory is allocated in the worker thread instead of the main thread
async function readFileIntoBuffer(
  file: File,
  buffer: Uint8Array
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    const chunkSize = 1024 * 1024; // 1MB chunks
    let offset = 0;

    const readNextChunk = () => {
      const slice = file.slice(offset, offset + chunkSize);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
      if (!e.target) {
        throw new Error('Failed to read file');
      }
      const chunk = new Uint8Array(e.target.result as ArrayBuffer);
      buffer.set(chunk, offset);
      offset += chunk.length;

      if (offset < file.size) {
        readNextChunk();
      } else {
        resolve();
      }
    };

    reader.onerror = reject;

    readNextChunk();
  });
}
