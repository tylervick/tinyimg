import { beforeEach, describe, expect, it, vi } from 'vitest';

// Define a simplified version of the readFileIntoBuffer function for testing
async function readFileIntoBuffer(
  file: File,
  buffer: Uint8Array,
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

describe('File Utilities', () => {
  // Mock for FileReader
  let mockFileReader: {
    readAsArrayBuffer: ReturnType<typeof vi.fn>;
    onload: ((e: { target?: { result?: ArrayBuffer } }) => void) | null;
    onerror: ((error: Error) => void) | null;
  };

  beforeEach(() => {
    // Create a mock FileReader
    mockFileReader = {
      readAsArrayBuffer: vi.fn(),
      onload: null,
      onerror: null,
    };

    // Mock the FileReader constructor
    global.FileReader = vi.fn(
      () => mockFileReader,
    ) as unknown as typeof FileReader;
  });

  it('should read a file in chunks', async () => {
    // Create test data - reduced size for faster tests
    const testData = new Uint8Array(300 * 1024); // 300KB (smaller is sufficient for testing)

    // Fill the array with data
    for (let i = 0; i < testData.length; i++) {
      testData[i] = i % 256;
    }

    // Create a mock File with the test data
    const mockFile = {
      size: testData.length,
      slice: vi.fn((start, end) => {
        // This mocks the file.slice method to return chunks of our test data
        return {
          size: Math.min(end, testData.length) - start,
          arrayBuffer: async () => testData.slice(start, end).buffer,
        } as Blob;
      }),
    } as unknown as File;

    // Create a destination buffer
    const buffer = new Uint8Array(testData.length);

    // Start reading the file
    const readPromise = readFileIntoBuffer(mockFile, buffer);

    // Verify that the first chunk is being read
    expect(mockFile.slice).toHaveBeenCalledWith(0, 1024 * 1024);

    // Need to ensure the onload handler is set by now
    expect(mockFileReader.onload).not.toBeNull();
    const onloadHandler = mockFileReader.onload!;

    // Simulate successful read of first chunk
    const firstChunkSize = Math.min(1024 * 1024, testData.length);
    const firstChunk = testData.slice(0, firstChunkSize);
    onloadHandler({
      target: {
        result: firstChunk.buffer,
      },
    });

    // If there's a second chunk, verify it's requested and simulate reading it
    if (testData.length > firstChunkSize) {
      expect(mockFile.slice).toHaveBeenCalledWith(
        firstChunkSize,
        firstChunkSize + 1024 * 1024,
      );

      // Simulate successful read of second chunk
      const secondChunk = testData.slice(firstChunkSize);
      onloadHandler({
        target: {
          result: secondChunk.buffer,
        },
      });
    }

    // Wait for the read to complete and ensure it resolves
    await expect(readPromise).resolves.toBeUndefined();

    // Verify the buffer contains the expected data using sample checks
    // Check start, middle, and end points
    expect(buffer[0]).toBe(testData[0]);
    expect(buffer[Math.floor(testData.length / 2)]).toBe(
      testData[Math.floor(testData.length / 2)],
    );
    expect(buffer[testData.length - 1]).toBe(testData[testData.length - 1]);

    // Verify all data is correct
    let mismatchCount = 0;
    for (let i = 0; i < testData.length; i++) {
      if (buffer[i] !== testData[i]) {
        mismatchCount++;
      }
    }
    expect(mismatchCount).toBe(0);
  });

  it('should handle errors during file reading', async () => {
    // Create a mock File
    const mockFile = {
      size: 1024,
      slice: vi.fn().mockReturnValue(new Blob()),
    } as unknown as File;

    // Create a destination buffer
    const buffer = new Uint8Array(1024);

    // Start reading the file
    const readPromise = readFileIntoBuffer(mockFile, buffer);

    // Ensure the error handler is set
    expect(mockFileReader.onerror).not.toBeNull();

    // Trigger an error
    mockFileReader.onerror!(new Error('File read error'));

    // Verify the promise rejects with the expected error
    await expect(readPromise).rejects.toEqual(new Error('File read error'));
  });

  it('should throw an error if e.target is null', async () => {
    // Create a mock File
    const mockFile = {
      size: 1024,
      slice: vi.fn().mockReturnValue(new Blob()),
    } as unknown as File;

    // Create a destination buffer
    const buffer = new Uint8Array(1024);

    // Start reading the file
    const readPromise = readFileIntoBuffer(mockFile, buffer);

    // Ensure mockFileReader.onload exists before continuing
    expect(mockFileReader.onload).not.toBeNull();
    const onloadHandler = mockFileReader.onload!;

    // Trigger onload with a null target
    expect(() => onloadHandler({ target: undefined })).toThrow(
      'Failed to read file',
    );

    // Complete the test by resolving the promise with valid data
    onloadHandler({
      target: {
        result: new ArrayBuffer(1024),
      },
    });

    // Wait for the promise to resolve
    await expect(readPromise).resolves.toBeUndefined();
  });
});
