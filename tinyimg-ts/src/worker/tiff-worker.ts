import '../wasm/wasm_exec';

interface WasmExports extends WebAssembly.Exports {
  tiffToJpeg: (base64Ptr: number) => number;
  startChunkedConversion: () => boolean;
  addChunk: (base64Ptr: number) => boolean;
  finishChunkedConversion: () => number;
  allocateString: (str: string) => number;
  freeString: (ptr: number) => void;

  // Memory
  memory: WebAssembly.Memory;
  mem: WebAssembly.Memory;
}

let exports: WasmExports;

/**
 * Initialize the WASM module
 */
async function initializeWasm(wasmPath: string): Promise<void> {
  try {
    console.log(`Worker: Loading WASM from ${wasmPath}`);
    const go = new Go();

    const wasmResponse = await fetch(wasmPath);
    if (!wasmResponse.ok) {
      throw new Error(
        `Failed to fetch WASM file: ${wasmResponse.status} ${wasmResponse.statusText}`
      );
    }

    const wasmBytes = await wasmResponse.arrayBuffer();
    const result = await WebAssembly.instantiate(wasmBytes, go.importObject);
    exports = result.instance.exports as WasmExports;
    await go.run(result.instance);

    console.log(`Worker: WASM initialized successfully`);
  } catch (error) {
    console.error(`Worker: Failed to initialize WASM: ${error}`);
    throw error;
  }
}

/**
 * Read a string from WASM memory
 */
function readStringFromMemory(ptr: number): string | null {
  if (ptr === 0) return null;

  let memory: Uint8Array;
  if (exports.mem) {
    memory = new Uint8Array(exports.mem.buffer);
  } else if (exports.memory) {
    memory = new Uint8Array(exports.memory.buffer);
  } else {
    throw new Error('Memory not found in WASM exports');
  }

  // Find the end of the string (null terminator)
  let end = ptr;
  while (memory[end] !== 0) {
    end++;
  }

  // Extract the string data
  const bytes = memory.slice(ptr, end);
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

/**
 * Convert TIFF to JPEG
 */
function convertTiffToJpeg(tiffBase64: string): string {
  if (!exports) {
    throw new Error('WASM not initialized');
  }

  // Allocate memory for the input string
  const ptr = exports.allocateString(tiffBase64);
  if (!ptr) {
    throw new Error('Failed to allocate memory for input');
  }

  try {
    // Call the WASM function
    const resultPtr = exports.tiffToJpeg(ptr);
    if (!resultPtr) {
      throw new Error('TIFF to JPEG conversion failed');
    }

    // Read the result
    const result = readStringFromMemory(resultPtr);
    if (!result) {
      throw new Error('Failed to read result from memory');
    }

    return result;
  } finally {
    // Free the allocated memory
    exports.freeString(ptr);
  }
}

/**
 * Start a chunked conversion
 */
function startChunkedConversion(): boolean {
  if (!exports) {
    throw new Error('WASM not initialized');
  }

  return exports.startChunkedConversion();
}

/**
 * Add a chunk to the conversion
 */
function addChunk(chunkBase64: string): boolean {
  if (!exports) {
    throw new Error('WASM not initialized');
  }

  // Allocate memory for the input string
  const ptr = exports.allocateString(chunkBase64);
  if (!ptr) {
    throw new Error('Failed to allocate memory for chunk');
  }

  try {
    // Call the WASM function
    return exports.addChunk(ptr);
  } finally {
    // Free the allocated memory
    exports.freeString(ptr);
  }
}

/**
 * Finish a chunked conversion
 */
function finishChunkedConversion(): string {
  if (!exports) {
    throw new Error('WASM not initialized');
  }

  // Call the WASM function
  const resultPtr = exports.finishChunkedConversion();
  if (!resultPtr) {
    throw new Error('Chunked conversion failed');
  }

  // Read the result
  const result = readStringFromMemory(resultPtr);
  if (!result) {
    throw new Error('Failed to read result from memory');
  }

  return result;
}

// handle messages from the main thread
self.onmessage = async (event: MessageEvent) => {
  const { type, id, data, wasmPath } = event.data;

  try {
    switch (type) {
      case 'init':
        await initializeWasm(wasmPath);
        self.postMessage({ type: 'init', id, success: true });
        break;
      case 'convert':
        const jpegBase64 = convertTiffToJpeg(data);
        self.postMessage({ type: 'result', id, data: jpegBase64 });
        break;
      case 'startChunked':
        const started = startChunkedConversion();
        self.postMessage({ type: 'result', id, data: started });
        break;
      case 'addChunk':
        const added = addChunk(data);
        self.postMessage({ type: 'result', id, data: added });
        break;
      case 'finishChunked':
        const result = finishChunkedConversion();
        self.postMessage({ type: 'result', id, data: result });
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
