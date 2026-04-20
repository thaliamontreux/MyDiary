import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    allowedHosts: ['.translife.online'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true
      }
    }
  }
});
