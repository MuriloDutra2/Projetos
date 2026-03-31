import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/main/calculations.ts'],
      exclude: ['**/*.test.ts', '**/node_modules/**']
    },
    reporters: ['default'],
    outputFile: undefined
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
