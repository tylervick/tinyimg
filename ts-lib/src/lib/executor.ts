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

    return await this.sendToWorker({
      type: 'convert',
      input: file,
    });
  }
}
