import { node, serverOnly } from '../../vitest.preset.ts'

/** The repositories and writer import `server-only`, which tests replace. */
export const resolve = { alias: serverOnly }

export default node({ resolve })
