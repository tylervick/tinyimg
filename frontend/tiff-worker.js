importScripts('./runner.js');

let isInitialized = false;
let exports = null;

self.onmessage = async function(e) {
  const { type, requestId, data } = e.data;

  try {
    switch (type) {
      case 'init':
        await initializeWasm(data.wasmPath);
        self.postMessage({ type: 'initialized' });
        break;

      case 'convert':
        if (!isInitialized) {
          throw new Error('WASM module not initialized');
        }
        const jpegBase64 = tiffToJpeg(data.tiffBase64);
        self.postMessage({ type: 'result', requestId, jpegBase64 });
        break;

      case 'startChunked':
        if (!isInitialized) {
          throw new Error('WASM module not initialized');
        }
        exports.startChunkedConversion();
        self.postMessage({ type: 'result', requestId, success: true });
        break;

      case 'addChunk':
        if (!isInitialized) {
          throw new Error('WASM module not initialized');
        }
        addChunk(data.chunk);
        self.postMessage({
          type: 'result',
          requestId,
          success: true,
          progress: data.progress
        });
        break;

      case 'finishChunked':
        if (!isInitialized) {
          throw new Error('WASM module not initialized');
        }
        const resultPtr = exports.finishChunkedConversion();
        if (resultPtr === 0) {
          throw new Error('Chunked conversion failed');
        }
        console.log('Chunked conversion result:', resultPtr);
        const result = readStringFromMemory(resultPtr);
        self.postMessage({ type: 'result', requestId, jpegBase64: result });
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({
      type: 'error',
      requestId,
      error: error.message || String(error)
    });
  }
};

// Initialize the WebAssembly module
 async function initializeWasm(wasmPath) {
   try {
     console.log('Worker: Loading WASM from', wasmPath);
     const go = new Go();

     // Try to fetch the WASM file first to check if it exists
     const wasmResponse = await fetch(wasmPath);
     if (!wasmResponse.ok) {
       throw new Error(`Failed to fetch WASM file: ${wasmResponse.status} ${wasmResponse.statusText}`);
     }

     const result = await WebAssembly.instantiateStreaming(
       fetch(wasmPath),
       go.importObject
     );
     go.run(result.instance);
     exports = result.instance.exports;
     isInitialized = true;
     console.log('WASM module initialized in worker');
   } catch (error) {
     console.error('Failed to initialize WASM in worker:', error);
     throw error;
   }
 }

 function readStringFromMemory(ptr) {
  if (ptr === 0) return null;

  let memory;
  if (exports.mem) {
    memory = new Uint8Array(exports.mem.buffer);
  } else {
    memory = new Uint8Array(exports.memory.buffer);
  }

  let end = ptr;

  // Find the end of the string (null terminator)
  while (memory[end] !== 0) {
    end++;
  }

  // Extract the string data
  const bytes = memory.slice(ptr, end);
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}
