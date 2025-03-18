import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Use the base option for GitHub Pages
  // This should match your repository name: /repository-name/
  // For user pages: set to '/'
  base: '/tinyimg/',

  build: {
    // Output to a separate directory to not conflict with the library build
    outDir: 'demo-dist',
    // Don't minify for better debugging
    minify: true,
    // Copy the WASM files
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },

  worker: {
    format: 'es',
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@wasm': resolve(__dirname, 'wasm'),
    },
  },

  // Enable cross-origin isolation for SharedArrayBuffer
  plugins: [
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
