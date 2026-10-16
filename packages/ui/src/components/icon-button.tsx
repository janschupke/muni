'use client'

import type { ComponentProps } from 'react'

import { Button } from './button'
import { Tooltip } from './tooltip'

/**
 * A button that shows only an icon: its label is the accessible name and appears as a
 * tooltip on hover and focus.
 */
export function IconButton({
  label,
  side,
  variant = 'ghost',
  size = 'icon-sm',
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'aria-label' | 'title'> & {
  label: string
  side?: 'top' | 'right' | 'bottom' | 'left' | undefined
}) {
  return (
    <Tooltip content={label} side={side}>
      <Button variant={variant} size={size} aria-label={label} {...props}>
        {children}
      </Button>
    </Tooltip>
  )
}
