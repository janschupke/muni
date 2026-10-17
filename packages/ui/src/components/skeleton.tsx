import type { HTMLAttributes } from 'react'

import { cn } from '../cn'

/**
 * A placeholder block shaped like content that is still loading. Hidden from assistive
 * technology: the region around it says it is loading (`role="status"`, `aria-busy`).
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('rounded-md bg-surface-sunken motion-safe:animate-pulse', className)}
      {...props}
    />
  )
}

/** Lines of text still loading; the last one shorter, as a paragraph ends. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3.5', i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}
