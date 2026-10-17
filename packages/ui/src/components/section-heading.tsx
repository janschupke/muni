import type { ReactNode } from 'react'

import { cn } from '../cn'

/** Heading of a page section below the page header (`h2`), with optional description and actions. */
export function SectionHeading({
  children,
  description,
  actions,
  className,
}: {
  children: ReactNode
  /** A line under the heading saying what the section shows. */
  description?: ReactNode | undefined
  actions?: ReactNode | undefined
  className?: string | undefined
}) {
  return (
    <div className={cn('mt-8 mb-3 flex flex-wrap items-end justify-between gap-2', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-base font-semibold text-fg">{children}</h2>
        {Boolean(description) && <p className="text-sm text-fg-muted">{description}</p>}
      </div>
      {Boolean(actions) && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
