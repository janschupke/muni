'use client'

import { useEffect, useState } from 'react'

/** How long a value must stay the same before it counts as settled: the user has paused. */
export const SETTLE_MS = 400

/**
 * `value` once it has stayed the same for SETTLE_MS, so a question asked of the server
 * waits for the user to pause; `undefined` until the first one settles. Compared with
 * `Object.is`, so pass a primitive (a key) rather than a new object each render.
 */
export function useSettled<T>(value: T): T | undefined {
  const [settled, setSettled] = useState<{ value: T } | undefined>(undefined)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled({ value })
    }, SETTLE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [value])
  return settled?.value
}
