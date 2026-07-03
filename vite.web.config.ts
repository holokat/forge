// Renderer-only config: lets the UI run in a plain browser (with a mock
// in-memory vault) for design work and visual testing.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  server: { port: 5188 }
})
