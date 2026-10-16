import type { ReactNode } from 'react'

import { cn } from '../cn'

/** Swatch + label keys for a chart. `swatchClassName` carries the series' fill. */
export function Legend({
  items,
  className,
}: {
  items: { key: string; label: ReactNode; swatchClassName: string }[]
  className?: string | undefined
}) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted', className)}>
      {items.map(item => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2.5 rounded-sm', item.swatchClassName)} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
