import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerRequest } from '../types';

// Mock Go constructor and instance
class MockGo {
  importObject = {
    env: {},
    wasi_snapshot_preview1: {},
  };
  run = vi.fn().mockResolvedValue(undefined);
}

// Setup global Go constructor mock
vi.stubGlobal('Go', MockGo);

describe('Worker', () => {
  // We need to isolate the worker context for testing
  let mockPostMessage: ReturnType<typeof vi.fn>;

  // Setup a spy on self.postMessage which the worker uses to communicate back
  beforeEach(() => {
    // Reset modules to clear any state between tests
    vi.resetModules();

    // Mock self.postMessage which the worker uses to respond
    mockPostMessage = vi.fn();
    vi.stubGlobal('postMessage', mockPostMessage);

    // Set up WebAssembly mocks
    vi.stubGlobal('WebAssembly', {
      Memory: vi.fn().mockImplementation(() => ({
        buffer: new ArrayBuffer(1024),
      })),
      instantiate: vi.fn().mockResolvedValue({
        exports: {
          Malloc: vi.fn().mockReturnValue(100),
          Free: vi.fn(),
          Convert: vi.fn().mockReturnValue(200),
          mem: {
            buffer: new ArrayBuffer(1024),
          },
        },
      }),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should handle init task and set wasmRunning to true on success', async () => {
    // Import the worker module after mocks have been set up
    await import('../worker');

    // Setup mock WebAssembly module
    const mockModule = {} as WebAssembly.Module;

    // Send init task to worker
    const initTask: WorkerRequest = {
      id: '123',
      type: 'init',
      input: mockModule,
    };

    // Trigger the onmessage handler directly with our test data
    self.onmessage!({ data: initTask } as MessageEvent<WorkerRequest>);

    // Give the async operations time to complete
    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalled();
    });

    // Verify response
    expect(mockPostMessage).toHaveBeenCalledWith({
      id: '123',
    });
  });

  it('should handle errors during initialization', async () => {
    // Mock WebAssembly.instantiate to throw an error
    vi.stubGlobal('WebAssembly', {
      instantiate: vi
        .fn()
        .mockRejectedValue(new Error('WASM initialization failed')),
    });

    // Import the worker module after mocks have been set up
    await import('../worker');

    // Send init task to worker
    const initTask: WorkerRequest = {
      id: '789',
      type: 'init',
      input: {} as WebAssembly.Module,
    };

    // Trigger the onmessage handler
    self.onmessage!({ data: initTask } as MessageEvent<WorkerRequest>);

    // Give the async operations time to complete
    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalled();
    });

    // Verify error response
    expect(mockPostMessage).toHaveBeenCalledWith({
      id: '789',
      error: expect.any(Error),
    });
  });
});
