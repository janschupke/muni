import { fileURLToPath } from 'node:url'

import { mergeConfig } from 'vitest/config'

import { node } from '../../vitest.preset.ts'

// Vitest runs outside the react-server condition, where the real `server-only` throws.
export default mergeConfig(node(), {
  resolve: {
    alias: { 'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)) },
  },
})
