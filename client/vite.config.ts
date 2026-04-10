import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/tractor/',
  server: {
    port: 8080,
    strictPort: true,
    proxy: {
      '/tractor/api': {
        target: 'http://localhost:8081',
        rewrite: (path) => path.replace(/^\/tractor/, ''),
      },
      '/tractor/ws': {
        target: 'ws://localhost:8081',
        ws: true,
        rewrite: (path) => path.replace(/^\/tractor/, ''),
      },
    },
  },
});
