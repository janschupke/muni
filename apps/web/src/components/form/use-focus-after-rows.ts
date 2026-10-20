'use client'

import { useEffect, useRef } from 'react'

/**
 * Focus for a list of rows the user adds to and removes from: once the rows have changed (the
 * form is told, so it sees what it now posts), a new row's first control takes the focus, and
 * after a removal the "Add" button does. Call `added()` or `removed()` with the change.
 */
export function useFocusAfterRows(count: number, changed: () => void) {
  const listRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const pending = useRef<'added' | 'removed' | null>(null)
  useEffect(() => {
    const what = pending.current
    if (what === null) return
    pending.current = null
    changed()
    if (what === 'added') {
      const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-row]')
      rows?.[rows.length - 1]?.querySelector<HTMLElement>('button, input, select')?.focus()
    } else {
      addRef.current?.focus()
    }
  }, [count, changed])
  return {
    listRef,
    addRef,
    added: () => {
      pending.current = 'added'
    },
    removed: () => {
      pending.current = 'removed'
    },
  }
}
