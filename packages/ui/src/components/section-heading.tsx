import type { ReactNode } from 'react'

import { cn } from '../cn'

/** Heading of a page section below the page header (`h2`), with optional actions. */
export function SectionHeading({
  children,
  actions,
  className,
}: {
  children: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mt-8 mb-3 flex flex-wrap items-center justify-between gap-2', className)}>
      <h2 className="text-base font-semibold text-fg">{children}</h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
