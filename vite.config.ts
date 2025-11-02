import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Prevent Vite from pre‑bundling these heavy, browser-initialized libs.
    // They are loaded lazily only when exporting .apkg
    exclude: ['sql.js', 'anki-apkg-export'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
