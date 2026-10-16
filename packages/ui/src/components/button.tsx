import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../cn'

/** Shared with link-styled buttons in the app (`<Link className={buttonClass({...})}>`). */
export const buttonClass = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
        secondary:
          'border border-border-default bg-surface-elevated text-fg hover:bg-state-hover active:bg-state-active',
        ghost: 'text-fg-muted hover:bg-state-hover hover:text-fg active:bg-state-active',
        danger: 'bg-danger-fill text-white hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-9 px-4 text-sm',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  }
)

export type ButtonVariants = VariantProps<typeof buttonClass>

export function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariants) {
  return <button type={type} className={cn(buttonClass({ variant, size }), className)} {...props} />
}
