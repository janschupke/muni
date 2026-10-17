import { ArrowRight } from 'lucide-react'
import { Slot } from 'radix-ui'
import type { AnchorHTMLAttributes } from 'react'

import { cn } from '../cn'

/**
 * A link, in the link colour, underlined on hover; every link in the app looks this way. With
 * `asChild` the styling goes onto the child, which keeps routing to the app
 * (`<TextLink asChild><Link href="…">…</Link></TextLink>`). A link never sits inside a sentence:
 * colour alone cannot set it apart from the words around it in the dark theme (WCAG 1.4.1), so
 * it stands on its own line or in its own cell. `arrow` ends it with an arrow (a link that
 * leads on: "In the list →"); `hitArea` makes it at least 24px tall, for links stacked in lists
 * and cells (WCAG 2.2 target size).
 */
export function TextLink({
  asChild = false,
  emphasis = false,
  arrow = false,
  hitArea = false,
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  asChild?: boolean | undefined
  emphasis?: boolean | undefined
  arrow?: boolean | undefined
  hitArea?: boolean | undefined
}) {
  const Comp = asChild ? Slot.Root : 'a'
  return (
    <Comp
      data-link=""
      className={cn(
        'text-link underline-offset-2 transition-colors hover:underline',
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
