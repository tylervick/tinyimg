import { WorkerConvertRequest, WorkerRequest, WorkerResponse } from '@/types';
import wasmWorker from '@/worker?worker';
import wasmUrl from '@wasm/tinyimg.wasm?no-inline';

export interface ProcessResult {
  blob: Blob;
  file: File;
  index: number;
}

export default class WorkerController {
  private initialized = false;
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private maxWorkers: number;
  private wasmModule: WebAssembly.Module | null = null;
  private pendingTasks: {
    task: () => Promise<Blob>;
    resolve: (value: Blob) => void;
    reject: (reason: Error | unknown) => void;
  }[] = [];

  constructor(maxWorkers = navigator.hardwareConcurrency || 4) {
    this.maxWorkers = maxWorkers;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.wasmModule = await WebAssembly.compileStreaming(fetch(wasmUrl));

    // Create all workers in the pool
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new wasmWorker();

      // Initialize each worker with the wasm module
      await this.sendToWorker<void>(
        {
          type: 'init',
          input: this.wasmModule,
          id: crypto.randomUUID(),
        },
        worker,
      );

      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }

    // If we got here, initialization was successful (no error thrown)
    this.initialized = true;

    // Process any pending tasks
    this.processPendingTasks();
  }

  private async sendToWorker<R>(
    request: WorkerRequest,
    worker: Worker,
  ): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const messageHandler = (e: MessageEvent<WorkerResponse<R>>) => {
        const { data, error, id } = e.data;

        if (id !== request.id) {
          return;
        }

        worker.removeEventListener('message', messageHandler);

        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      };

      worker.addEventListener('message', messageHandler);
      worker.postMessage(request);
    });
  }

  private getAvailableWorker(): Worker | null {
    if (this.availableWorkers.length === 0) {
      return null;
    }
    return this.availableWorkers.pop() || null;
  }

  private releaseWorker(worker: Worker): void {
    this.availableWorkers.push(worker);
    // Check if there are pending tasks that can now be processed
    this.processPendingTasks();
  }

  private processPendingTasks(): void {
    while (this.pendingTasks.length > 0 && this.availableWorkers.length > 0) {
      const task = this.pendingTasks.shift();
      if (task) {
        task.task().then(task.resolve).catch(task.reject);
      }
    }
  }

  public async streamTiffToJpeg(file: File): Promise<Blob> {
    if (!crossOriginIsolated) {
      throw new Error('Cross-origin isolation is not enabled');
    }

    if (!this.initialized) {
      await this.initialize();
    }

    return new Promise<Blob>((resolve, reject) => {
      const processFile = async (): Promise<Blob> => {
        const worker = this.getAvailableWorker();
        if (!worker) {
          throw new Error('No available workers');
        }

        try {
          // The worker will check if WASM is running and throw an error if not
          const request: WorkerConvertRequest = {
            type: 'convert',
            input: file,
            id: crypto.randomUUID(),
          };

          const result = await this.sendToWorker<Blob>(request, worker);
          this.releaseWorker(worker);
          return result;
        } catch (error) {
          this.releaseWorker(worker);
          throw error;
        }
      };

      // If there's an available worker, process immediately, otherwise queue
      const worker = this.getAvailableWorker();
      if (worker) {
        processFile().then(resolve).catch(reject);
      } else {
        this.pendingTasks.push({
          task: processFile,
          resolve,
          reject,
        });
      }
    });
  }

  // Process a file and call the callback when it's done
  public async processFileWithCallback(
    file: File,
    index: number,
    onComplete: (result: ProcessResult) => void,
    onError?: (error: Error | unknown, file: File, index: number) => void,
  ): Promise<void> {
    try {
      const blob = await this.streamTiffToJpeg(file);
      onComplete({ blob, file, index });
    } catch (error) {
      if (onError) {
        onError(error, file, index);
      } else {
        console.error(`Error processing file ${file.name}:`, error);
      }
    }
  }

  // Stream processing of multiple files, with a callback for each completed file
  public async batchProcessWithProgress(
    files: File[],
    onFileComplete: (result: ProcessResult) => void,
    onError?: (error: Error | unknown, file: File, index: number) => void,
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Start processing all files, but don't wait for the results
    const processes = files.map((file, index) =>
      this.processFileWithCallback(file, index, onFileComplete, onError),
    );

    // Wait for all processes to complete
    await Promise.all(processes);
  }

  // Process multiple files in parallel (original method kept for compatibility)
  public async batchProcess(files: File[]): Promise<Blob[]> {
    return Promise.all(files.map((file) => this.streamTiffToJpeg(file)));
  }
}
