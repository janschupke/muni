import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../cn'

export const buttonClass = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
        secondary:
          'border border-border-default bg-control text-fg hover:layer-hover active:layer-active',
        /** Only for backing out (CancelButton) and for icon buttons. */
        ghost: 'text-fg-muted hover:bg-state-hover hover:text-fg active:bg-state-active',
        /** Confirms a destructive act: the group's one filled button, in place of primary. */
        danger: 'bg-danger-fill text-danger-ink hover:layer-hover active:layer-active',
        /** Starts a destructive act (archive): a secondary button in the danger ink. */
        destructive:
          'border border-border-default bg-control text-danger-fg hover:layer-hover active:layer-active',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-9 px-4 text-sm',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  }
)

type ButtonVariants = VariantProps<typeof buttonClass>

/**
 * A button, or with `asChild` the styling applied to its single child
 * (`<Button asChild><Link href="…">…</Link></Button>`).
 *
 * In a group of buttons one is primary (or danger, confirming a destructive act) and it comes
 * last, on the right; the others, navigation included, are secondary, with a background; only
 * a way back out of something is ghost (CancelButton). e2e/support/buttons.ts holds every
 * rendered group to it, by the variant each button carries.
 */
export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: ComponentProps<'button'> & ButtonVariants & { asChild?: boolean | undefined }) {
  const classes = cn(buttonClass({ variant, size }), className)
  const marks = { 'data-slot': 'button', 'data-variant': variant ?? 'secondary' }
  // Marked, so a link drawn as a button is judged as a button, not as a link in text.
  if (asChild) return <Slot.Root {...marks} className={classes} {...props} />
  return <button type={type} {...marks} className={classes} {...props} />
}

/** Backs out of a form or a dialog without doing anything: the one ghost button. */
export function CancelButton(props: Omit<ComponentProps<typeof Button>, 'variant'>) {
  return <Button variant="ghost" data-cancel="" {...props} />
}
