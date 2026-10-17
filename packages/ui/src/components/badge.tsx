import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'

import { cn } from '../cn'

export const badgeClass = cva(
  'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums [&_svg]:size-3.5',
  {
    variants: {
      tone: {
        neutral: 'border-border-default bg-tint text-fg-muted',
        /** The brand: who someone is (an admin), never a state. */
        accent: 'border-info-border bg-accent-soft text-accent-text',
        /** A state that needs nothing (on leave, planned). */
        info: 'border-info-border bg-info-soft text-info-fg',
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
  // Marked: a framed label beside a link is not a sentence the link sits in.
  return <span data-slot="badge" className={cn(badgeClass({ tone }), className)} {...props} />
}
