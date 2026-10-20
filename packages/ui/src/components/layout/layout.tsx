import { Slot } from 'radix-ui'
import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../cn'

/**
 * The page's content column: full width up to 1920px, centred beyond. `asChild` puts it on
 * the child (`<main>`).
 */
export function Container({
  asChild = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { asChild?: boolean | undefined }) {
  const Comp = asChild ? Slot.Root : 'div'
  return (
    <Comp className={cn('mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8', className)} {...props} />
  )
}

/** A narrow side column next to a wide main one from `lg`; stacked below it. */
export function SplitLayout({ side, main }: { side: ReactNode; main: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="min-w-0">{side}</div>
      <div className="min-w-0 lg:col-span-2">{main}</div>
    </div>
  )
}
