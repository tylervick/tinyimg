package main

import (
	"bytes"
	"encoding/base64"
	"image/jpeg"
	"structs"
	"sync"
	"syscall/js"
	"unsafe"

	"golang.org/x/image/tiff"
)

// Global buffer to store chunks
var (
	chunksMutex sync.Mutex
	chunks      [][]byte
	processing  bool
)

func main() {
	c := make(chan struct{})

	// Register JavaScript functions
	js.Global().Set("tiffToJpeg", js.FuncOf(tiffToJpeg))
	// js.Global().Set("startChunkedConversion", js.FuncOf(startChunkedConversion))
	js.Global().Set("addChunk", js.FuncOf(addChunk))
	// js.Global().Set("finishChunkedConversion", js.FuncOf(finishChunkedConversion))

	println("WASM module initialized")
	<-c // Keep the program running
}

// tiffToJpeg converts a base64 encoded TIFF image to a base64 encoded JPEG image
func tiffToJpeg(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf("Error: Missing TIFF data")
	}

	// Get the base64 encoded TIFF data
	tiffBase64 := args[0].String()

	// Decode the base64 string to bytes
	tiffData, err := base64.StdEncoding.DecodeString(tiffBase64)
	if err != nil {
		return js.ValueOf("Error decoding base64: " + err.Error())
	}

	// Decode TIFF
	tiffImage, err := tiff.Decode(bytes.NewReader(tiffData))
	if err != nil {
		return js.ValueOf("Error decoding TIFF: " + err.Error())
	}

	// Encode as JPEG
	var jpegBuf bytes.Buffer
	err = jpeg.Encode(&jpegBuf, tiffImage, &jpeg.Options{Quality: 90})
	if err != nil {
		return js.ValueOf("Error encoding JPEG: " + err.Error())
	}

	// Convert back to base64
	jpegBase64 := base64.StdEncoding.EncodeToString(jpegBuf.Bytes())

	return js.ValueOf(jpegBase64)
}

// Start a new chunked conversion
//
//go:wasmexport startChunkedConversion
func startChunkedConversion() bool {
	chunksMutex.Lock()
	defer chunksMutex.Unlock()

	// Reset state
	chunks = make([][]byte, 0)
	processing = false

	return true
}

// Add a chunk to the buffer
func addChunk(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf("Error: Missing chunk data")
	}

	// Get the base64 encoded chunk
	chunkBase64 := args[0].String()

	// Decode the base64 string to bytes
	chunkData, err := base64.StdEncoding.DecodeString(chunkBase64)
	if err != nil {
		return js.ValueOf("Error decoding base64: " + err.Error())
	}

	// Add to our chunks buffer
	chunksMutex.Lock()
	chunks = append(chunks, chunkData)
	chunksMutex.Unlock()

	return js.ValueOf(true)
}

// Process all chunks and return the JPEG
//
//go:wasmexport finishChunkedConversion
func finishChunkedConversion() unsafe.Pointer {
	chunksMutex.Lock()
	defer chunksMutex.Unlock()

	if processing {
		println("Error: Already processing")
		return nil
	}

	processing = true

	// Combine all chunks
	totalSize := 0
	for _, chunk := range chunks {
		totalSize += len(chunk)
	}

	combinedData := make([]byte, totalSize)
	position := 0
	for _, chunk := range chunks {
		copy(combinedData[position:], chunk)
		position += len(chunk)
	}

	// Decode TIFF
	tiffImage, err := tiff.Decode(bytes.NewReader(combinedData))
	if err != nil {
		println("Error decoding TIFF: " + err.Error())
		return nil
	}

	// Encode as JPEG
	var jpegBuf bytes.Buffer
	err = jpeg.Encode(&jpegBuf, tiffImage, &jpeg.Options{Quality: 90})
	if err != nil {
		println("Error encoding JPEG: " + err.Error())
		return nil
	}

	// Convert back to base64
	jpegBase64 := base64.StdEncoding.EncodeToString(jpegBuf.Bytes())

	// Reset state
	chunks = nil
	processing = false

	return unsafe.Pointer(unsafe.StringData(jpegBase64))
}

var allocatedBytes = map[uintptr][]byte{}

// get SharedArrayBuffer pointer
//
//go:wasmexport Malloc
func Malloc(size int32) uintptr {
	buf := make([]byte, size)
	ptr := &buf[0]
	unsafePtr := uintptr(unsafe.Pointer(ptr))
	allocatedBytes[unsafePtr] = buf
	return unsafePtr
}

func getBytes(ptr uintptr) []byte {
	return allocatedBytes[ptr]
}

//go:wasmexport Free
func Free(ptr uintptr) {
	delete(allocatedBytes, ptr)
}

type JpegResult struct {
	_      structs.HostLayout
	Ptr    uint32
	Size   int32
	Status int32 // 0 = success, negative = error
}

//go:wasmexport Convert
func Convert(ptr uintptr, size int32) *JpegResult {
	inputBuf := allocatedBytes[ptr]
	tiffImage, err := tiff.Decode(bytes.NewReader(inputBuf))

	if err != nil {
		println("Error decoding TIFF: " + err.Error())
		return &JpegResult{Status: -1} // Error
	}

	var jpegBuf bytes.Buffer
	err = jpeg.Encode(&jpegBuf, tiffImage, &jpeg.Options{Quality: 90})
	if err != nil {
		println("Error encoding JPEG: " + err.Error())
		return &JpegResult{Status: -2}
	}

	jpegBytes := jpegBuf.Bytes()
	jpegSize := int32(len(jpegBytes))

	resultPtr := Malloc(jpegSize)
	resultSlice := getBytes(resultPtr)
	copy(resultSlice, jpegBytes)

	return &JpegResult{
		Ptr:    uint32(resultPtr),
		Size:   jpegSize,
		Status: 0,
	}
}
