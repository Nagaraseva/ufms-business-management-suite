import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The hosted preview proxies the app under a generated *.e2b.app domain.
    // Without this Vite rejects the Host header (403) and the preview is blank.
    allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'],
    // Proxy API calls so the browser only ever talks to its own origin.
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true } },
  },
});
