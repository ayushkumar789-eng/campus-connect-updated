import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // The dev proxy target is configuration, not a constant. Hardcoding
  // localhost:5050 here meant a second checkout, a container or a staging API
  // could not be pointed at without editing source.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:5050';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(env.VITE_PORT) || 5173,
      // Proxying keeps the browser on one origin in dev, so the httpOnly
      // refresh cookie is sent without any CORS or SameSite special-casing.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/uploads': { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      // Split the heaviest vendor code out of the main bundle.
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            query: ['@tanstack/react-query', 'zustand'],
          },
        },
      },
    },
  };
});
