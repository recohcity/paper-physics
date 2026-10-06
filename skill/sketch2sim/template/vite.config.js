import { defineConfig } from 'vite';

// For deployment under /cases/<slug>/dist/, set base:
//   base: '/cases/<slug>/dist/'
export default defineConfig({
  base: '/',
  server: { host: '127.0.0.1', port: 5500 },
  build: { outDir: 'dist' },
});
