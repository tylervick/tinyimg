importScripts('./runner.js');

let isInitialized = false;

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
        startChunkedConversion();
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
        const result = finishChunkedConversion();
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
     isInitialized = true;
     console.log('WASM module initialized in worker');
   } catch (error) {
     console.error('Failed to initialize WASM in worker:', error);
     throw error;
   }
 }
