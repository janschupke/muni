import { Slot } from 'radix-ui'
import type { AnchorHTMLAttributes } from 'react'

import { cn } from '../cn'

/**
 * An inline link. With `asChild` the styling goes onto the child, which keeps routing to the
 * app (`<TextLink asChild><Link href="…">…</Link></TextLink>`).
 */
export function TextLink({
  asChild = false,
  emphasis = false,
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { asChild?: boolean; emphasis?: boolean }) {
  const Comp = asChild ? Slot.Root : 'a'
  return (
    <Comp
      className={cn(
        'text-fg underline-offset-2 hover:underline',
        emphasis && 'font-medium',
        className
      )}
      {...props}
    />
  )
}
