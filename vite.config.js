import { defineConfig } from 'vite';

// Root dev server: serves all cases' built dist files at /cases/<slug>/dist/
// Usage: npm run dev  →  http://localhost:5175/cases/lobby/dist/
export default defineConfig({
  server: { host: '127.0.0.1', port: 5175 },
  preview: { host: '127.0.0.1', port: 5175 },
});
