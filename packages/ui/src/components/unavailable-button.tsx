'use client'

import { type ComponentProps, useId } from 'react'

import { cn } from '../cn'
import { Button } from './button'
import { Tooltip } from './tooltip'

/**
 * A button that cannot be used here, and says why: shown dimmed where the working one would
 * be, so the action is not simply missing. It stays focusable and takes the pointer, so the
 * reason shows as a tooltip on hover and on focus; assistive technology reads it as the
 * button's description. Pressing it does nothing.
 */
export function UnavailableButton({
  reason,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'onClick' | 'disabled' | 'asChild' | 'type'> & {
  /** Why it cannot be used: the tooltip and the accessible description. */
  reason: string
}) {
  const id = useId()
  return (
    <>
      {/* The tooltip only shows sighted users the description below. */}
      <Tooltip content={reason} repeatsName>
        <Button
          {...props}
          aria-disabled
          aria-describedby={id}
          className={cn(
            // The kit's dimmed look, but with the pointer, for the tooltip; no hover fill.
            'cursor-not-allowed aria-disabled:pointer-events-auto aria-disabled:hover:bg-none aria-disabled:active:bg-none',
            className
          )}
        >
          {children}
        </Button>
      </Tooltip>
      <span id={id} hidden>
        {reason}
      </span>
    </>
  )
}
