import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'

import { cn } from '../cn'
import { surfaceClass } from './card'

/**
 * The scroll box around a table. `relative` makes it the containing block of absolutely
 * positioned descendants (the `sr-only` labels in cells), so its overflow clips them too;
 * without it they sit outside the box and stretch the page sideways on phones.
 *
 * `paging` says how the table's rows are paged: `server` (one page the server sorted and cut),
 * or why every row is here (rows that exist only in the browser, a list bounded by something
 * small). The rendered table carries it (`data-paging`), and the e2e checks hold every table
 * to saying it.
 */
export function TableContainer({
  className,
  paging,
  ...props
}: HTMLAttributes<HTMLDivElement> & { paging: string }) {
  return (
    <div
      data-paging={paging === 'server' ? 'server' : `local: ${paging}`}
      className={cn('relative overflow-x-auto', surfaceClass, className)}
      {...props}
    />
  )
}

/**
 * A table. Outside a TableContainer (in a panel, a dialog) it says how its rows are paged
 * itself, the way TableContainer does (`paging`).
 */
export function Table({
  className,
  density = 'default',
  paging,
  ...props
}: HTMLAttributes<HTMLTableElement> & {
  density?: 'default' | 'compact' | undefined
  paging?: string | undefined
}) {
  return (
    <table
      data-paging={
        paging === undefined ? undefined : paging === 'server' ? 'server' : `local: ${paging}`
      }
      className={cn(
        'w-full border-collapse text-sm',
        // Overrides the cells' own padding (descendant selectors outrank their utilities).
        density === 'compact' && '[&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1',
        className
      )}
      {...props}
    />
  )
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('bg-surface-sunken text-left text-xs text-fg-muted', className)}
      {...props}
    />
  )
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border-muted', className)} {...props} />
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        // The row's state as a variable: cells without a fill show the row's background, and
        // sticky cells paint it over their own (layer-row). No transition: a background
        // image cannot fade, so a fading row would lag behind its pinned cells.
        'bg-(--row-state) hover:[--row-state:var(--color-state-hover)]',
        className
      )}
      {...props}
    />
  )
}

export interface CellLayout {
  /** `right` also switches to tabular figures, for numbers and amounts. */
  align?: 'left' | 'right' | undefined
  nowrap?: boolean | undefined
  /** Pins the column while the table scrolls sideways. */
  sticky?: 'left' | 'right' | undefined
}

function cellLayout({ align, nowrap, sticky }: CellLayout) {
  return cn(
    align === 'right' && 'text-right tabular-nums',
    nowrap && 'whitespace-nowrap',
    sticky === 'left' && 'sticky left-0',
    sticky === 'right' && 'sticky right-0'
  )
}

export function Th({
  className,
  scope = 'col',
  align,
  nowrap,
  sticky,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & CellLayout) {
  return (
    <th
      scope={scope}
      className={cn(
        // Row headers sit outside <thead>, so they need their own alignment.
        'border-b border-border-default px-3 py-2 text-left font-medium whitespace-nowrap',
        cellLayout({ align, nowrap, sticky }),
        sticky && 'z-20 bg-surface-sunken layer-row',
        className
      )}
      {...props}
    />
  )
}

export function Td({
  className,
  align,
  nowrap,
  sticky,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & CellLayout) {
  return (
    <td
      className={cn(
        'px-3 py-2 align-middle text-fg',
        cellLayout({ align, nowrap, sticky }),
        sticky && 'z-[1] bg-surface-elevated layer-row',
        className
      )}
      {...props}
    />
  )
}

/** A cell's primary content with a quieter line under it (`Name` / `E0001`). */
export function CellStack({ title, meta }: { title: ReactNode; meta?: ReactNode | undefined }) {
  return (
    <div className="min-w-0">
      {title}
      {meta !== undefined && <div className="text-xs text-fg-subtle">{meta}</div>}
    </div>
  )
}
