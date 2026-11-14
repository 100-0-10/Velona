import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = process.env.VELONA_BACKEND_URL || 'http://127.0.0.1:5080';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: backend }, '/health': { target: backend }, '/hubs': { target: backend, ws: true } } },
  preview: { port: 4173, strictPort: true, proxy: { '/api': { target: backend }, '/health': { target: backend }, '/hubs': { target: backend, ws: true } } },
});
