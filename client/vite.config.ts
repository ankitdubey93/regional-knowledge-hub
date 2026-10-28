import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
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
    proxy: { '/api': 'http://localhost:5191' },
  },
});
