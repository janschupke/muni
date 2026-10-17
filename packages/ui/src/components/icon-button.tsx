'use client'

import type { ComponentProps } from 'react'

import { cn } from '../cn'
import { Button } from './button'
import { Tooltip } from './tooltip'

/**
 * What the action does, in its colour at rest and a soft fill of it on hover: open or edit
 * (accent), bring back (success), archive or remove (danger, the one colour of every
 * destructive act). Neutral controls (close, clear a filter, fold the sidebar) stay grey.
 */
const TONE = {
  neutral: '',
  accent: 'text-accent-text hover:bg-accent-soft hover:text-accent-text',
  success: 'text-success-fg hover:bg-success-soft hover:text-success-fg',
  danger: 'text-danger-fg hover:bg-danger-soft hover:text-danger-fg',
} as const

/**
 * A button that shows only an icon: its label is the accessible name and appears as a
 * tooltip on hover and focus.
 */
export function IconButton({
  label,
  side,
  tone = 'neutral',
  variant = 'ghost',
  size = 'icon-sm',
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'aria-label' | 'title'> & {
  label: string
  side?: 'top' | 'right' | 'bottom' | 'left' | undefined
  tone?: keyof typeof TONE | undefined
}) {
  return (
    // The tooltip shows the button's own name: hidden from assistive tech, which reads it once.
    <Tooltip content={label} side={side} repeatsName>
      <Button
        variant={variant}
        size={size}
        aria-label={label}
        className={cn(TONE[tone], className)}
        {...props}
      >
        {children}
      </Button>
    </Tooltip>
  )
}
