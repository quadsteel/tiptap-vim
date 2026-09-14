import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'tiptap-extension-vim': path.resolve(__dirname, '../packages/extension/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})
