import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:3000';
const apiPaths = ['/me', '/payouts', '/axis-callbacks', '/fund-transfer', '/balance'];

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['saasorbitwealth.com', 'localhost'],
    hmr: {
      host: 'saasorbitwealth.com',
      protocol: 'wss',
      clientPort: 443
    },
    proxy: Object.fromEntries(
      apiPaths.map(p => [p, { target: apiTarget, changeOrigin: true }])
    )
  }
});
