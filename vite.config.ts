import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// The app lives at the domain root (no URL_BASE / subpath support — see
// §4). Fastify serves the built SPA out of dist/client.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/client',
  base: '/',
  define: {
    __GIT_COMMIT__: JSON.stringify(process.env.GIT_COMMIT || 'dev'),
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, './src/core'),
      '@': path.resolve(__dirname, './src/client'),
    },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
