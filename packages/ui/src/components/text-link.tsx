import { Slot } from 'radix-ui'
import type { AnchorHTMLAttributes } from 'react'

import { cn } from '../cn'

const TONE = {
  /** Body text that turns brand blue and underlines on hover. */
  default: 'text-fg hover:text-accent-text hover:underline',
  /** Secondary text (footers, column heads) that brightens and underlines on hover. */
  muted: 'text-fg-muted hover:text-fg hover:underline',
  /**
   * Inside coloured text (alerts): takes the colour, always underlined, and the underline
   * thickens on hover.
   */
  inherit:
    'text-inherit underline decoration-current/50 hover:decoration-current hover:decoration-2',
} as const

/**
 * An inline link. With `asChild` the styling goes onto the child, which keeps routing to the
 * app (`<TextLink asChild><Link href="…">…</Link></TextLink>`).
 */
export function TextLink({
  asChild = false,
  emphasis = false,
  tone = 'default',
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  asChild?: boolean
  emphasis?: boolean
  tone?: keyof typeof TONE
}) {
  const Comp = asChild ? Slot.Root : 'a'
  return (
    <Comp
      className={cn(
        'underline-offset-2 transition-colors',
        TONE[tone],
        emphasis && 'font-medium',
        className
      )}
      {...props}
    />
  )
}
