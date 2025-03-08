let tiffWorker: Worker | null = null;
let requestId = 0;
const pendingResolvers: Record<
  number,
  {
    resolve: (value: void | PromiseLike<void>) => void;
    reject: (reason?: any) => void;
  }
> = {};

/**
 * Initialize the TIFF worker
 */
function initWorker(): Promise<void> {
  console.log('Initializing worker...');
  if (tiffWorker) return Promise.resolve();

  return new Promise((resolve, reject) => {
    try {
      // Create a new worker with Vite's worker import
      tiffWorker = new Worker(
        new URL('../worker/tiff-worker.ts', import.meta.url),
        { type: 'module' }
      );
      console.log('Worker created, waiting for initialization...');

      // Initialize the worker with the WASM file
      const wasmUrl = new URL('../wasm/tiff2jpeg.wasm', import.meta.url).href;

      const id = ++requestId;
      pendingResolvers[id] = { resolve, reject };

      tiffWorker.onmessage = (event) => {
        handleWorkerMessage(event);
      };

      tiffWorker.onerror = (error) => {
        console.error('Worker error:', error);
        reject(error);
      };

      tiffWorker.postMessage({
        type: 'init',
        id,
        wasmPath: wasmUrl,
      });
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      reject(error);
    }
  });
}

function handleWorkerMessage(event: MessageEvent) {
  const { type, id, data, error, progress } = event.data;

  if (type === 'progress') {
    updateProgressBar(progress);
    return;
  }

  const resolver = pendingResolvers[id];
  if (!resolver) {
    console.warn(`Received message for unknown request: ${id}`);
    return;
  }

  if (type === 'error') {
    resolver.reject(error);
  } else {
    resolver.resolve(data);
  }

  delete pendingResolvers[id];
}

/**
 * Convert a TIFF image to JPEG format
 * @param tiffBase64 Base64-encoded TIFF data
 * @returns Promise resolving to base64-encoded JPEG data
 */
async function convertTiffToJpeg(tiffBase64: string): Promise<string> {
  await initWorker();

  const id = ++requestId;

  return new Promise((resolve, reject) => {
    pendingResolvers[id] = { resolve, reject };

    tiffWorker?.postMessage({
      type: 'convert',
      id,
      tiffBase64,
    });
  });
}

/**
 * Stream a TIFF file to JPEG format in chunks
 * @param file The TIFF file to convert
 * @param chunkSize Size of each chunk in bytes
 * @returns Promise resolving to base64-encoded JPEG data
 */
async function streamTiffToJpeg(
  file: File,
  chunkSize: number = 1024 * 1024
): Promise<string> {
  await initWorker();

  await new Promise<void>((resolve, reject) => {
    const id = ++requestId;
    pendingResolvers[id] = {
      resolve,
      reject,
    };

    tiffWorker?.postMessage({
      type: 'startChunked',
      id,
    });
  });

  // process chunks
  const totalChunks = Math.ceil(file.size / chunkSize);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const chunk = file.slice(start, end);

    const base64Chunk = await readFileChunkAsBase64(chunk);

    await new Promise<void>((resolve, reject) => {
      const id = ++requestId;
      pendingResolvers[id] = {
        resolve,
        reject,
      };

      tiffWorker?.postMessage({
        type: 'addChunk',
        id,
        data: base64Chunk,
      });
    });

    updateProgressBar(Math.round(((i + 1) * 100) / totalChunks));
  }

  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingResolvers[id] = { resolve, reject };

    tiffWorker!.postMessage({
      type: 'finishChunked',
      id,
    });
  });
}

/**
 * Read a file chunk as base64
 */
function readFileChunkAsBase64(chunk: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // Get base64 data (remove the data URL prefix)
      const result = e.target?.result as string;
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(chunk);
  });
}

/**
 * Update the progress bar
 */
function updateProgressBar(progress: number): void {
  const progressBar = document.getElementById(
    'progressBar'
  ) as HTMLProgressElement | null;
  if (progressBar) {
    progressBar.value = progress;
    progressBar.textContent = `${progress}%`;
  }
}

// Export the public API
export default {
  convertTiffToJpeg,
  streamTiffToJpeg,
};
