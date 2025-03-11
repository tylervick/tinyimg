import { Task } from '../lib/executor';
import '../wasm/wasm_exec';

interface WasmExports extends WebAssembly.Exports {
  Malloc: (size: number) => number;
  Free: (ptr: number) => void;
  Convert: (ptr: number, size: number) => number;
}

let wasmExports: WasmExports;

self.onmessage = async (event: MessageEvent<Task>) => {
  const { type, input, id } = event.data;
  switch (type) {
    case 'init':
      const taskResult = await runInitTask(input);
      self.postMessage({ data: taskResult, id });
      break;
    case 'convert':
      const taskResult2 = await runConvertTask(input);
      self.postMessage({ data: taskResult2, id });
      // self.postMessage(taskResult);
      break;
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
};

async function runInitTask(module: WebAssembly.Module): Promise<void> {
  const go = new Go();
  const instance = await WebAssembly.instantiate(module, go.importObject);
  // todo: set exports
  wasmExports = instance.exports as WasmExports;
  return go.run(instance);
}

async function runConvertTask(file: File): Promise<Blob> {
  const buf = new SharedArrayBuffer(file.size);
  const sharedArray = new Uint8Array(buf);

  await readFileIntoBuffer(file, sharedArray);

  const ptr = wasmExports.Malloc(buf.byteLength);
  const wasmMemory = new Uint8Array(
    wasmExports.mem.buffer,
    ptr,
    buf.byteLength
  );
  wasmMemory.set(new Uint8Array(buf));
  const resultStructPtr = wasmExports.Convert(ptr, buf.byteLength);

  try {
    const resultView = new DataView(wasmExports.mem.buffer, resultStructPtr);
    const jpegPtr = resultView.getUint32(0, true);
    const jpegSize = resultView.getInt32(4, true);
    const status = resultView.getInt32(8, true);

    if (status !== 0) {
      throw new Error(`Conversion failed with status: ${status}`);
    }

    // Create a copy of the data
    const jpegData = new Uint8Array(wasmExports.mem.buffer, jpegPtr, jpegSize);
    const jpegBlob = new Blob([jpegData.slice(0)], { type: 'image/jpeg' });

    return jpegBlob;
  } finally {
    wasmExports.Free(ptr);
    if (resultStructPtr) {
      wasmExports.Free(resultStructPtr);
    }
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
