import type { ReactNode } from 'react'

import { cn } from '../cn'
import { surfaceClass } from './card'

/**
 * The layout of an opened row's details: panels side by side where there is room. Every
 * expanded view is built from these, so they read alike across the app.
 */
export function DetailGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string | undefined
}) {
  return <div className={cn('grid gap-4 lg:grid-cols-2', className)}>{children}</div>
}

/**
 * One block of an opened row: a card with a heading, an optional count and actions, and its
 * content. The heading is an `h2` (a list page has only its `h1` above), or an `h3` where the
 * table sits under a section `h2` (`level`). A table inside it fills the card edge to
 * edge (`flush`); text and lists get the card's padding.
 */
export function DetailPanel({
  title,
  count,
  actions,
  level = 2,
  flush = false,
  className,
  children,
}: {
  title: ReactNode
  /** Shown after the title ("Booked people · 12"). */
  count?: number | undefined
  actions?: ReactNode | undefined
  level?: 2 | 3 | undefined
  flush?: boolean | undefined
  className?: string | undefined
  children: ReactNode
}) {
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <section className={cn(surfaceClass, 'flex min-w-0 flex-col overflow-hidden', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border-muted px-4 py-2.5">
        <Heading className="text-sm font-semibold text-fg">
          {title}
          {count !== undefined && (
            <>
              {' '}
              <span className="ml-0.5 font-normal text-fg-muted tabular-nums">· {count}</span>
            </>
          )}
        </Heading>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className={cn('min-w-0', flush ? 'overflow-x-auto' : 'px-4 py-3')}>{children}</div>
    </section>
  )
}
