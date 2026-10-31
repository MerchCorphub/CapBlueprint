import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built into ../cap-ops so GitHub Pages serves it at /capblueprint/cap-ops/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: '../cap-ops', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
