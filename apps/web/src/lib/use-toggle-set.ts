'use client'

import { useState } from 'react'

/** A set the reader opens and closes items of (a department's people, a row's details). */
export function useToggleSet<T>(): [ReadonlySet<T>, (item: T) => void] {
  const [items, setItems] = useState<ReadonlySet<T>>(() => new Set())
  const toggle = (item: T) => {
    setItems(prev => {
      const next = new Set(prev)
      if (!next.delete(item)) next.add(item)
      return next
    })
  }
  return [items, toggle]
}
