import { ArrowRight } from 'lucide-react'
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
 * app (`<TextLink asChild><Link href="…">…</Link></TextLink>`). `arrow` ends it with an arrow
 * (a link that leads on: "In the list →"); `hitArea` makes it at least 24px tall, for links
 * stacked in lists and cells (WCAG 2.2 target size).
 */
export function TextLink({
  asChild = false,
  emphasis = false,
  tone = 'default',
  arrow = false,
  hitArea = false,
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  asChild?: boolean | undefined
  emphasis?: boolean | undefined
  tone?: keyof typeof TONE | undefined
  arrow?: boolean | undefined
  hitArea?: boolean | undefined
}) {
  const Comp = asChild ? Slot.Root : 'a'
  return (
    <Comp
      className={cn(
        'underline-offset-2 transition-colors',
        TONE[tone],
        emphasis && 'font-medium',
        (arrow || hitArea) && 'inline-flex items-center gap-1',
        hitArea && 'min-h-6',
        className
      )}
      {...props}
    >
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : children}
      {arrow && <ArrowRight aria-hidden className="size-3.5 shrink-0" />}
    </Comp>
  )
}
