import type { ReactNode } from 'react'

import { cn } from '../../cn'

/** Label / value pairs in two aligned columns. */
export function DescriptionList({
  children,
  className,
}: {
  children: ReactNode
  className?: string | undefined
}) {
  return (
    <dl className={cn('grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm', className)}>
      {children}
    </dl>
  )
}

export function DescriptionItem({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </>
  )
}

/** Small labelled figures in a grid (two per row on phones, four from `sm`). */
export function StatList({
  children,
  className,
}: {
  children: ReactNode
  className?: string | undefined
}) {
  return (
    <dl className={cn('grid grid-cols-2 gap-2 text-sm sm:grid-cols-4', className)}>{children}</dl>
  )
}

export function StatItem({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  )
}
