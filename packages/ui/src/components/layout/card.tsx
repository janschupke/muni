import { Slot } from 'radix-ui'
import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../cn'

/** The raised surface every card-like box shares (cards, stat cards, table frames). */
export const surfaceClass =
  'rounded-lg border border-border-default bg-surface-elevated shadow-card'

/** A raised surface; a `<section>`, or with `asChild` its child (`<li>` in a list). */
export function Card({
  asChild = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { asChild?: boolean | undefined }) {
  const Comp = asChild ? Slot.Root : 'section'
  return <Comp className={cn(surfaceClass, className)} {...props} />
}

/**
 * A card's heading row. The heading is an `h2` (a page has only its `h1` above), or an `h3`
 * where the card sits under a section's `h2` (`level`).
 */
export function CardHeader({
  title,
  description,
  actions,
  level = 2,
  className,
}: {
  title: ReactNode
  description?: ReactNode | undefined
  actions?: ReactNode | undefined
  level?: 2 | 3 | undefined
  className?: string | undefined
}) {
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-4', className)}>
      <div className="min-w-0">
        <Heading className="text-base font-semibold text-fg">{title}</Heading>
        {Boolean(description) && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {Boolean(actions) && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />
}
