# tinyimg

## Setup

Use devcontainers

or

- Install `task`
- `task install:tinygo`
- `task install:wasmtime`
- `task install:binaryen`

## Build

Produce the wasm binary and bootstrap code in the [build](./build) directory
`task build -- ./pkg`

## Serve

Serve the compiled content on localhost:1337
`task serve`
