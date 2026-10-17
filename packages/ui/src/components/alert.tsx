import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { cn } from '../cn'
import { type MessageTone, TONE_ICON, TONE_INK } from './tone'

type AlertTone = MessageTone

const alertClass = cva(
  'flex items-start gap-2 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      tone: TONE_INK,
      variant: {
        box: 'rounded-md border px-3 py-2',
        inline: 'font-medium',
      },
    },
    compoundVariants: [
      { variant: 'box', tone: 'danger', className: 'border-danger-border bg-danger-soft' },
      { variant: 'box', tone: 'warning', className: 'border-warning-border bg-warning-soft' },
      { variant: 'box', tone: 'success', className: 'border-success-border bg-success-soft' },
      { variant: 'box', tone: 'info', className: 'border-info-border bg-info-soft' },
    ],
  }
)

/**
 * A message with a status tone. Tone always comes with an icon, never colour alone.
 * Danger announces itself (`role="alert"`); the other tones are polite (`role="status"`).
 */
export function Alert({
  tone,
  variant = 'box',
  title,
  children,
  role = tone === 'danger' ? 'alert' : 'status',
  className,
}: {
  tone: AlertTone
  variant?: 'box' | 'inline' | undefined
  title?: ReactNode | undefined
  children?: ReactNode | undefined
  role?: 'alert' | 'status' | 'none' | undefined
  className?: string | undefined
}) {
  const Icon = TONE_ICON[tone]
  return (
    <div
      role={role === 'none' ? undefined : role}
      className={cn(alertClass({ tone, variant }), className)}
    >
      <Icon aria-hidden />
      <div className="min-w-0">
        {Boolean(title) && <p className="font-medium">{title}</p>}
        {children}
      </div>
    </div>
  )
}
