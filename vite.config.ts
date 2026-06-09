import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Repo-root config; Vite root is src/web so index.html sits beside the app.
const webRoot = fileURLToPath(new URL('./src/web', import.meta.url))
const distWeb = fileURLToPath(new URL('./dist/web', import.meta.url))

export default defineConfig({
  root: webRoot,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: distWeb,
    emptyOutDir: true,
    sourcemap: true,
  },
})
