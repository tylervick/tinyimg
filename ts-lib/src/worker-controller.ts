import { WorkerConvertRequest, WorkerRequest, WorkerResponse } from '@/types';
import wasmWorker from '@/worker?worker';
import wasmUrl from '@wasm/tinyimg.wasm?no-inline';

export default class WorkerController {
  private initialized = false;
  private worker: Worker | null = null;

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const module = await WebAssembly.compileStreaming(fetch(wasmUrl));
    this.worker = new wasmWorker();

    await this.sendToWorker<void>({
      type: 'init',
      input: module,
      id: crypto.randomUUID(),
    });

    // If we got here, initialization was successful (no error thrown)
    this.initialized = true;
  }

  private async sendToWorker<R>(request: WorkerRequest): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      if (!this.worker) {
        throw new Error('Worker not initialized');
      }

      const messageHandler = (e: MessageEvent<WorkerResponse<R>>) => {
        const { data, error, id } = e.data;

        if (id !== request.id) {
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
      this.worker.postMessage(request);
    });
  }

  public async streamTiffToJpeg(file: File): Promise<Blob> {
    if (!crossOriginIsolated) {
      throw new Error('Cross-origin isolation is not enabled');
    }

    if (!this.initialized) {
      await this.initialize();
    }

    // The worker will check if WASM is running and throw an error if not
    const request: WorkerConvertRequest = {
      type: 'convert',
      input: file,
      id: crypto.randomUUID(),
    };

    return await this.sendToWorker<Blob>(request);
  }
}
