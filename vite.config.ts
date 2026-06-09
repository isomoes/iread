import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Repo-root config; Vite root is src/web so index.html sits beside the app.
const webRoot = fileURLToPath(new URL('./src/web', import.meta.url))
const distWeb = fileURLToPath(new URL('./dist/web', import.meta.url))

// Inject the package version as a compile-time constant (see vite-env.d.ts) so
// the brand mark can show it without bundling all of package.json.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }

export default defineConfig({
  root: webRoot,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
