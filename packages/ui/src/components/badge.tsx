import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'

import { cn } from '../cn'

export const badgeClass = cva(
  'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums [&_svg]:size-3.5',
  {
    variants: {
      tone: {
        neutral: 'border-border-default bg-tint text-fg-muted',
        accent: 'border-info-border bg-accent-soft text-accent-text',
        success: 'border-success-border bg-success-soft text-success-fg',
        warning: 'border-warning-border bg-warning-soft text-warning-fg',
        serious: 'border-serious-border bg-serious-soft text-serious-fg',
        danger: 'border-danger-border bg-danger-soft text-danger-fg',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
)

export type BadgeTone = NonNullable<VariantProps<typeof badgeClass>['tone']>

export function Badge({
  tone,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeClass>) {
  return <span className={cn(badgeClass({ tone }), className)} {...props} />
}
