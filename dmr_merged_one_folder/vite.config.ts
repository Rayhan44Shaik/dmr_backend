import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    // Allow the sandbox preview host (e.g. <port>-<id>.e2b.app) to connect.
    allowedHosts: true,
    // Browser-facing mobile code uses a relative URL; Vite reaches the local
    // office backend from the sandbox/development host, never browser localhost.
    proxy: {
      "/api/mobile": {
        target: "http://127.0.0.1:4000",
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
})
