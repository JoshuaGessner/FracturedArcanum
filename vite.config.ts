import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const arenaPort = process.env.PORT ?? '43173'
const arenaOrigin = `http://localhost:${arenaPort}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': arenaOrigin,
      '/socket.io': {
        target: arenaOrigin,
        ws: true,
      },
    },
  },
})
