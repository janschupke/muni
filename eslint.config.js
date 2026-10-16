// The repo-root config files only; every workspace package has its own eslint.config.js.
import { node } from './eslint.preset.js'

export default [{ ignores: ['apps/**', 'packages/**'] }, ...node(import.meta.dirname)]
