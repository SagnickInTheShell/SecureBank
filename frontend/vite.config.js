import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/auth': 'http://127.0.0.1:8001',
      '/accounts': 'http://127.0.0.1:8001',
      '/transactions': 'http://127.0.0.1:8001',
      '/health': 'http://127.0.0.1:8001',
    },
  },
})
