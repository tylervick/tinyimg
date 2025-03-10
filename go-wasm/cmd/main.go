package main

import (
	"bytes"
	"encoding/base64"
	"image/jpeg"
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
