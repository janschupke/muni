'use client'

import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '../cn'
import { Button } from './button'

/**
 * A modal panel over a scrim: focus is trapped inside, Escape and the close button dismiss
 * it. Controlled; when it is opened from something other than a Radix trigger, pass
 * `returnFocusTo` so focus goes back to the control that opened it.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  returnFocusTo,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  closeLabel: string
  returnFocusTo?: () => HTMLElement | null | undefined
  className?: string
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          // Without a description, say so; otherwise Radix wires the Description itself.
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
          onCloseAutoFocus={event => {
            const target = returnFocusTo?.()
            if (!target) return
            event.preventDefault()
            target.focus()
          }}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border-default bg-surface-overlay text-fg shadow-overlay data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in',
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border-muted px-5 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <DialogPrimitive.Title className="text-base font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description === undefined ? null : (
                <DialogPrimitive.Description className="text-sm text-fg-muted">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={closeLabel} title={closeLabel}>
                <X aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
