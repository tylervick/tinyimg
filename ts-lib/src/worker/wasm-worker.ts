import { Task } from '../lib/executor';
import '../wasm/wasm_exec';

let wasmExports = null;

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
  wasmExports = instance.exports;
  // const instance = await WebAssembly.instantiateStreaming(
  //   fetch(init),
  //   go.importObject
  // );
  // todo: set exports
  return go.run(instance);
}

async function runConvertTask(buf: SharedArrayBuffer): Promise<Blob> {
  // console.log(buf);

  const ptr = wasmExports.Malloc(buf.byteLength);
  // console.log(ptr);

  const wasmMemory = new Uint8Array(
    wasmExports.mem.buffer,
    ptr,
    buf.byteLength
  );
  wasmMemory.set(new Uint8Array(buf));

  // const uint8ClampedArrayForMemBuf = new Uint8ClampedArray(
  //   wasmExports.mem.buffer,
  //   ptr,
  //   buf.byteLength
  // );
  // uint8ClampedArrayForMemBuf.set(new Uint8Array(buf));

  // const mem = new WebAssembly.Memory({})

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
