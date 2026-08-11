import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Capacitor copies this folder into the APK as the WebView's assets.
    outDir: 'dist',
    emptyOutDir: true,
    // The WebView loads from a file-like origin, so relative paths are required.
    assetsDir: 'assets',
  },
  // jeep-sqlite ships a custom element used only by the browser preview.
  optimizeDeps: {
    exclude: ['jeep-sqlite'],
  },
});
