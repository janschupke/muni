import { Slot } from 'radix-ui'
import type { HTMLAttributes } from 'react'

import { cn } from '../cn'

/**
 * A wrapping row of controls above a table: filters on the left, a summary pushed right.
 * Use `asChild` to make the toolbar itself a `<form role="search">`.
 */
export function Toolbar({
  asChild = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'div'
  return <Comp className={cn('mb-4 flex flex-wrap items-end gap-3', className)} {...props} />
}

export function ToolbarSummary({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  // Control height, so the text centres on the controls rather than sitting on their baseline.
  return (
    <span
      className={cn('ml-auto flex h-9 items-center text-sm text-fg-muted', className)}
      {...props}
    />
  )
}
