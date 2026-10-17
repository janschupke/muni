import { ArrowRight } from 'lucide-react'
import { Slot } from 'radix-ui'
import type { AnchorHTMLAttributes } from 'react'

import { cn } from '../cn'

const TONE = {
  /** The link colour, apart from every text grey; underlined on hover. */
  default: 'text-link hover:underline',
  /**
   * Inside coloured text (alerts): takes the colour, always underlined, and the underline
   * thickens on hover.
   */
  inherit:
    'text-inherit underline decoration-current/50 hover:decoration-current hover:decoration-2',
} as const

/**
 * A link, in the link colour before it is hovered. With `asChild` the styling goes onto the
 * child, which keeps routing to the app (`<TextLink asChild><Link href="…">…</Link></TextLink>`).
 * `inText` underlines it always, for a link inside a sentence, where colour alone would not
 * set it apart from the words around it (WCAG 1.4.1). `arrow` ends it with an arrow (a link
 * that leads on: "In the list →"); `hitArea` makes it at least 24px tall, for links stacked in
 * lists and cells (WCAG 2.2 target size).
 */
export function TextLink({
  asChild = false,
  emphasis = false,
  inText = false,
  tone = 'default',
  arrow = false,
  hitArea = false,
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  asChild?: boolean | undefined
  emphasis?: boolean | undefined
  inText?: boolean | undefined
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
        inText && 'underline decoration-link/50 hover:decoration-link hover:decoration-2',
        emphasis && 'font-medium',
        // A link inside a sentence flows with it (WCAG 2.5.8 exempts inline targets).
        (arrow || (hitArea && !inText)) && 'inline-flex items-center gap-1',
        hitArea && !inText && 'min-h-6',
        className
      )}
      {...props}
    >
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : children}
      {arrow && <ArrowRight aria-hidden className="size-3.5 shrink-0" />}
    </Comp>
  )
}
