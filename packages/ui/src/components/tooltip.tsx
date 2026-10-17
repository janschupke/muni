'use client'

import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

/**
 * One per app (the root layout). Tooltips share its delay, so moving along a row of them
 * opens each next one at once.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={150}>{children}</TooltipPrimitive.Provider>
}

/**
 * `repeatsName`: the content only shows sighted users what the trigger's accessible name
 * already says, so assistive technology skips the copy (and it does not count as content
 * outside the page's landmarks, where the portal puts it).
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  repeatsName = false,
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left' | undefined
  repeatsName?: boolean | undefined
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          aria-hidden={repeatsName || undefined}
          side={side}
          sideOffset={6}
          className="z-50 max-w-sm origin-(--radix-tooltip-content-transform-origin) rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-xs whitespace-pre-line text-fg shadow-overlay data-[state=closed]:animate-pop-out data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-pop-in"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
