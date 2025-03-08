import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'tinyimg',
      fileName: (format) => `tinyimg.${format}.js`,
    },
    rollupOptions: {
      output: {
        globals: {},
      },
    },
    // copy wasm file to dist
    assetsInlineLimit: 0,
    outDir: 'dist',
  },
  worker: {
    format: 'es',
  },
  publicDir: 'public',
  // configure dev server
  server: {
    port: 3000,
    open: true,
  },
});
