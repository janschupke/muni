'use client'

import { useEffect, useState } from 'react'

/**
 * `value` once it has stayed the same for `pauseMs`, so a question asked of the server waits
 * for the user to pause; `undefined` until the first one settles. Compared with `Object.is`,
 * so pass a primitive (a key) rather than a new object each render.
 */
export function useSettled<T>(value: T, pauseMs: number): T | undefined {
  const [settled, setSettled] = useState<{ value: T } | undefined>(undefined)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled({ value })
    }, pauseMs)
    return () => {
      clearTimeout(timer)
    }
  }, [value, pauseMs])
  return settled?.value
}
