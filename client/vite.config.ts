import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // CHUB_API_ORIGIN (no VITE_ prefix, so never bundled) points the proxy at the e2e API on 5193; dev uses 5191.
  const env = loadEnv(mode, '.', 'CHUB_');
  return {
    // Tailwind v4 is a Vite plugin configured from CSS; there is no tailwind.config.js.
    plugins: [react(), tailwindcss()],
    build: {
      // The main chunk carries the whole curriculum text and the data files (the
      // home page needs their titles and counts), so it is larger than Vite's
      // 500 kB default. The tools and pages load separately.
      chunkSizeWarningLimit: 600,
    },
    server: {
      port: 5190,
      strictPort: true,
      proxy: { '/api': env.CHUB_API_ORIGIN ?? 'http://localhost:5191' },
    },
  };
});
