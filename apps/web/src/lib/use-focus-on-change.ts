'use client'

import { type RefObject, useEffect, useRef } from 'react'

/**
 * Moves the focus to `target` each time `value` changes after the first render: a new step
 * of a wizard takes the focus when the button that led to it is gone.
 */
export function useFocusOnChange(target: RefObject<HTMLElement | null>, value: unknown) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    target.current?.focus()
  }, [target, value])
}
