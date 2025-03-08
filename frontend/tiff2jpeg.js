// Worker instance
let tiffWorker = null;
let isWorkerInitialized = false;
let pendingResolvers = {};
let requestId = 0;

// Initialize the worker
function initWorker() {
  console.log('Initializing worker...');
  if (tiffWorker) return Promise.resolve();
  
  return new Promise((resolve, reject) => {
    try {
      // Create a new worker
      tiffWorker = new Worker('./tiff-worker.js');
      console.log('Worker created, waiting for initialization...');
      
      // Set up message handling
      tiffWorker.onmessage = function(e) {
        console.log('Received message from worker:', e.data);
        const { type, requestId, error, ...data } = e.data;
        
        if (type === 'initialized') {
          isWorkerInitialized = true;
          resolve();
        } 
        else if (type === 'error') {
          if (requestId && pendingResolvers[requestId]) {
            pendingResolvers[requestId].reject(new Error(error));
            delete pendingResolvers[requestId];
          } else {
            console.error('Worker error:', error);
          }
        }
        else if (requestId && pendingResolvers[requestId]) {
          pendingResolvers[requestId].resolve(data);
          delete pendingResolvers[requestId];
        }
      };
      
      // Initialize the WASM module in the worker
      tiffWorker.postMessage({ 
        type: 'init', 
        data: { wasmPath: './frontend.wasm' } 
      });
      
      // Handle worker errors
      tiffWorker.onerror = function(err) {
        isWorkerInitialized = false;
        reject(new Error('Worker initialization failed: ' + err.message));
      };
    } catch (err) {
      reject(new Error('Failed to create worker: ' + err.message));
    }
  });
}

// Function to handle the TIFF to JPEG conversion for small files
async function convertTiffToJpeg(tiffBase64) {
  await initWorker();
  
  const id = ++requestId;
  
  return new Promise((resolve, reject) => {
    pendingResolvers[id] = { resolve, reject };
    
    tiffWorker.postMessage({
      type: 'convert',
      requestId: id,
      data: { tiffBase64 }
    });
  }).then(data => data.jpegBase64);
}

// Function to handle streaming conversion for large files
async function streamTiffToJpeg(file) {
  await initWorker();
  
  // Start a new conversion
  await new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingResolvers[id] = { resolve, reject };
    
    tiffWorker.postMessage({
      type: 'startChunked',
      requestId: id
    });
  });
  
  // Read the file in chunks
  const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
  const fileSize = file.size;
  let offset = 0;
  
  const progressCallback = typeof updateProgressBar === 'function' 
    ? updateProgressBar 
    : (progress) => console.log(`Processing: ${progress}%`);

  while (offset < fileSize) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const chunkBase64 = await readFileChunkAsBase64(chunk);
    
    const progress = Math.min(100, Math.round((offset / fileSize) * 100));
    
    // Send chunk to worker
    await new Promise((resolve, reject) => {
      const id = ++requestId;
      pendingResolvers[id] = { resolve, reject };
      
      tiffWorker.postMessage({
        type: 'addChunk',
        requestId: id,
        data: { 
          chunk: chunkBase64,
          progress
        }
      });
    }).then(data => {
      progressCallback(data.progress);
    });
    
    offset += CHUNK_SIZE;
  }

  // Finish the conversion
  const finalId = ++requestId;
  return new Promise((resolve, reject) => {
    pendingResolvers[finalId] = { resolve, reject };
    
    tiffWorker.postMessage({
      type: 'finishChunked',
      requestId: finalId
    });
  }).then(data => data.jpegBase64);
}

// Helper function to read a file chunk as base64
function readFileChunkAsBase64(chunk) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // Get base64 data (remove the data URL prefix)
      const base64Data = e.target.result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(chunk);
  });
}

// Function to update the progress bar
function updateProgressBar(progress) {
  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    progressBar.value = progress;
    progressBar.textContent = `${progress}%`;
  }
}

// Function to handle file input
async function handleFileInput(fileInput) {
  const file = fileInput.files[0];
  if (!file) {
    console.error('No file selected');
    return;
  }

  try {
    // Show loading indicator
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
      <p>Converting... please wait</p>
      <progress id="progressBar" value="0" max="100" style="width:100%">0%</progress>
    `;

    let jpegBase64;

    // Use streaming for large files (>10MB)
    if (file.size > 10 * 1024 * 1024) {
      console.log('Using streaming conversion for large file');
      jpegBase64 = await streamTiffToJpeg(file);
    } else {
      // For smaller files, use the simpler method
      updateProgressBar(10);
      const reader = new FileReader();
      const base64Data = await new Promise((resolve, reject) => {
        reader.onload = (e) => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      updateProgressBar(50);
      jpegBase64 = await convertTiffToJpeg(base64Data);
      updateProgressBar(100);
    }

    // Create a download link for the JPEG
    const downloadLink = document.createElement('a');
    downloadLink.href = 'data:image/jpeg;base64,' + jpegBase64;
    downloadLink.download = file.name.replace(/\.(tiff|tif)$/i, '.jpg');
    downloadLink.innerHTML = 'Download converted JPEG';
    downloadLink.className = 'download-button';

    // Also display the image
    const img = document.createElement('img');
    img.src = downloadLink.href;
    img.style.maxWidth = '100%';
    img.style.marginTop = '20px';

    // Update the result div
    resultDiv.innerHTML = '';
    resultDiv.appendChild(downloadLink);
    resultDiv.appendChild(document.createElement('br'));
    resultDiv.appendChild(img);
  } catch (error) {
    console.error('Conversion failed:', error);
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `<p class="error">Conversion failed: ${error.message}</p>`;
  }
}

// Clean up worker when page unloads
window.addEventListener('beforeunload', () => {
  if (tiffWorker) {
    tiffWorker.terminate();
    tiffWorker = null;
  }
});
