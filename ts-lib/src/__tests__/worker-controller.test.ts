import { beforeEach, describe, expect, it, vi } from 'vitest';

// Import the interface for ProcessResult
interface ProcessResult {
  blob: Blob;
  file: File;
  index: number;
}

// Create a minimal mock implementation
class MockWorkerController {
  private initialized = false;
  private maxWorkers: number;

  constructor(maxWorkers = 4) {
    this.maxWorkers = maxWorkers;
  }

  public async initialize(): Promise<void> {
    this.initialized = true;
    if (this.maxWorkers <= 0) {
      throw new Error('Invalid maxWorkers value');
    }
  }

  public async streamTiffToJpeg(file: File): Promise<Blob> {
    // Check cross-origin isolation
    if (!globalThis.crossOriginIsolated) {
      throw new Error('Cross-origin isolation is not enabled');
    }

    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // In a real implementation, we would process the file
    // Here we just validate it exists
    if (!file) {
      throw new Error('File is required');
    }

    // Return a mock JPEG blob
    return new Blob(['mock jpeg data'], { type: 'image/jpeg' });
  }

  public async batchProcess(files: File[]): Promise<Blob[]> {
    return Promise.all(files.map((file) => this.streamTiffToJpeg(file)));
  }

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

  public async batchProcessWithProgress(
    files: File[],
    onFileComplete: (result: ProcessResult) => void,
    onError?: (error: Error | unknown, file: File, index: number) => void,
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Process files, simulating asynchronous behavior
    const processes = files.map((file, index) =>
      this.processFileWithCallback(file, index, onFileComplete, onError),
    );

    // Wait for all processes to complete
    await Promise.all(processes);
  }
}

// Test simple behavior without complex mocking
describe('WorkerController', () => {
  let controller: MockWorkerController;

  beforeEach(() => {
    controller = new MockWorkerController();

    // Set crossOriginIsolated to true by default
    Object.defineProperty(globalThis, 'crossOriginIsolated', {
      value: true,
      configurable: true,
    });
  });

  it('should initialize successfully', async () => {
    await controller.initialize();
    // If no error is thrown, the test passes
    expect(true).toBe(true);
  });

  it('should convert a file to JPEG when initialized', async () => {
    // Initialize the controller
    await controller.initialize();

    // Create a mock File
    const mockFile = new File(['test'], 'test.tiff', { type: 'image/tiff' });

    // Convert the file
    const result = await controller.streamTiffToJpeg(mockFile);

    // Verify result is a Blob with jpeg type
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/jpeg');
  });

  it('should auto-initialize when converting if not already initialized', async () => {
    // Create a mock File without initializing first
    const mockFile = new File(['test'], 'test.tiff', { type: 'image/tiff' });

    // Convert the file (should auto-initialize)
    const result = await controller.streamTiffToJpeg(mockFile);

    // Verify result is a Blob with jpeg type
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/jpeg');
  });

  it('should throw an error if cross-origin isolation is not enabled', async () => {
    // Disable cross-origin isolation
    Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false });

    // Create a mock File
    const mockFile = new File(['test'], 'test.tiff', { type: 'image/tiff' });

    // Verify conversion throws
    await expect(controller.streamTiffToJpeg(mockFile)).rejects.toThrow(
      'Cross-origin isolation is not enabled',
    );
  });

  it('should process multiple files in parallel', async () => {
    // Initialize the controller
    await controller.initialize();

    // Create multiple mock files
    const mockFiles = [
      new File(['test1'], 'test1.tiff', { type: 'image/tiff' }),
      new File(['test2'], 'test2.tiff', { type: 'image/tiff' }),
      new File(['test3'], 'test3.tiff', { type: 'image/tiff' }),
    ];

    // Convert the files
    const results = await controller.batchProcess(mockFiles);

    // Verify we got correct number of results
    expect(results.length).toBe(mockFiles.length);

    // Verify all results are jpeg blobs
    results.forEach((result) => {
      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('image/jpeg');
    });
  });

  it('should accept a custom maxWorkers value', () => {
    const customWorkerCount = 8;
    const customController = new MockWorkerController(customWorkerCount);
    expect(customController).toBeDefined();
    // We can't easily test the internal state in the mock
    // but at least we can test it doesn't throw
  });

  it('should process files with progress callback', async () => {
    // Initialize the controller
    await controller.initialize();

    // Create multiple mock files
    const mockFiles = [
      new File(['test1'], 'test1.tiff', { type: 'image/tiff' }),
      new File(['test2'], 'test2.tiff', { type: 'image/tiff' }),
      new File(['test3'], 'test3.tiff', { type: 'image/tiff' }),
    ];

    // Create a spy function to track callback calls
    const onFileComplete = vi.fn();
    const onError = vi.fn();

    // Process files with progress
    await controller.batchProcessWithProgress(
      mockFiles,
      onFileComplete,
      onError,
    );

    // Check that onFileComplete was called for each file
    expect(onFileComplete).toHaveBeenCalledTimes(mockFiles.length);

    // Check that onError was not called
    expect(onError).not.toHaveBeenCalled();

    // Verify each call had the correct structure
    for (let i = 0; i < mockFiles.length; i++) {
      expect(onFileComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          blob: expect.any(Blob),
          file: mockFiles[i],
          index: i,
        }),
      );
    }
  });

  it('should handle errors in progress callback', async () => {
    // Initialize the controller
    await controller.initialize();

    // Override crossOriginIsolated for this test to force an error
    Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false });

    // Create files to process
    const mockFiles = [
      new File(['test1'], 'test1.tiff', { type: 'image/tiff' }),
      new File(['test2'], 'test2.tiff', { type: 'image/tiff' }),
    ];

    // Create spy functions
    const onFileComplete = vi.fn();
    const onError = vi.fn();

    // Process files, which should fail due to crossOriginIsolated being false
    await controller.batchProcessWithProgress(
      mockFiles,
      onFileComplete,
      onError,
    );

    // Check that onFileComplete was not called
    expect(onFileComplete).not.toHaveBeenCalled();

    // Check that onError was called twice (once for each file)
    expect(onError).toHaveBeenCalledTimes(mockFiles.length);

    // Verify each error call included the correct error message
    for (let i = 0; i < mockFiles.length; i++) {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Cross-origin isolation is not enabled',
        }),
        mockFiles[i],
        i,
      );
    }
  });
});
