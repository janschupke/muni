import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../cn'

export const buttonClass = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
        secondary:
          'border border-border-default bg-surface-elevated text-fg hover:bg-state-hover active:bg-state-active',
        ghost: 'text-fg-muted hover:bg-state-hover hover:text-fg active:bg-state-active',
        danger: 'bg-danger-fill text-danger-ink hover:opacity-90',
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
 */
export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariants & { asChild?: boolean | undefined }) {
  const classes = cn(buttonClass({ variant, size }), className)
  if (asChild) return <Slot.Root className={classes} {...props} />
  return <button type={type} className={classes} {...props} />
}
