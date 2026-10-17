'use client'

import { type KeyboardEvent, useRef, useState } from 'react'

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0))

/**
 * A block of cells that is one stop for Tab (the ARIA grid pattern's roving tabindex): only
 * the last focused cell is tabbable, the arrow keys move between cells, Home and End go to
 * the row's ends, and with Ctrl to the block's first and last cell. Spread `cell(row, col)`
 * on each focusable cell.
 */
export function useRovingGrid(rows: number, cols: number) {
  const [active, setActive] = useState({ row: 0, col: 0 })
  const cells = useRef(new Map<string, HTMLElement>())
  // Rows can go (a person leaves the block): the stop stays on a cell that exists.
  const current = { row: clamp(active.row, rows - 1), col: clamp(active.col, cols - 1) }

  const move = (row: number, col: number) => {
    const next = { row: clamp(row, rows - 1), col: clamp(col, cols - 1) }
    setActive(next)
    cells.current.get(`${String(next.row)}:${String(next.col)}`)?.focus()
  }

  return (row: number, col: number) => ({
    ref: (element: HTMLElement | null) => {
      const key = `${String(row)}:${String(col)}`
      if (element) cells.current.set(key, element)
      else cells.current.delete(key)
    },
    tabIndex: row === current.row && col === current.col ? 0 : -1,
    onFocus: () => {
      setActive({ row, col })
    },
    onKeyDown: (event: KeyboardEvent) => {
      const target: Record<string, [number, number] | undefined> = {
        ArrowRight: [row, col + 1],
        ArrowLeft: [row, col - 1],
        ArrowDown: [row + 1, col],
        ArrowUp: [row - 1, col],
        Home: event.ctrlKey ? [0, 0] : [row, 0],
        End: event.ctrlKey ? [rows - 1, cols - 1] : [row, cols - 1],
      }
      const next = target[event.key]
      if (!next) return
      event.preventDefault()
      move(...next)
    },
  })
}
