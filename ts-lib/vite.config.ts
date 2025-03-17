import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
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
  // configure dev server
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@wasm': resolve(__dirname, 'wasm'),
    },
  },
  plugins: [
    dts({ rollupTypes: true }),
    // Enable cross-origin isolation for SharedArrayBuffer
    {
      name: 'configure-response-headers',
      configureServer: (server) => {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          next();
        });
      },
    },
  ],
  assetsInclude: ['**/*.wasm'],
});
