'use client'

import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '../cn'
import { IconButton } from './icon-button'

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
  footer,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode | undefined
  closeLabel: string
  returnFocusTo?: (() => HTMLElement | null | undefined) | undefined
  className?: string | undefined
  /** The dialog's buttons, pinned under the scrolling body (the decision stays in view). */
  footer?: ReactNode | undefined
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          // Without a description, say so; otherwise Radix wires the Description itself.
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
          // Focus the panel, not its close button: a focused icon button shows its tooltip, and
          // the first Escape would then close the tooltip instead of the dialog.
          onOpenAutoFocus={event => {
            event.preventDefault()
            ;(event.currentTarget as HTMLElement).focus()
          }}
          onCloseAutoFocus={event => {
            const target = returnFocusTo?.()
            if (!target) return
            event.preventDefault()
            target.focus()
          }}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border-default bg-surface-overlay text-fg shadow-overlay outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in',
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
              <IconButton label={closeLabel}>
                <X aria-hidden />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer !== undefined && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-muted px-5 py-3">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * A panel sliding in from the left edge over a scrim (the mobile navigation). Focus is trapped
 * inside; Escape, the scrim and the close button dismiss it, and focus returns to its trigger.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  closeLabel,
  trigger,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  closeLabel: string
  /** The button that opens it (rendered in place, wired as the dialog trigger). */
  trigger: ReactNode
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Focus the panel, not its close button: a focused icon button shows its tooltip, and
          // the first Escape would then close the tooltip instead of the dialog.
          onOpenAutoFocus={event => {
            event.preventDefault()
            ;(event.currentTarget as HTMLElement).focus()
          }}
          className="fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col border-r border-border-default bg-surface-elevated text-fg shadow-overlay outline-none data-[state=closed]:animate-drawer-out data-[state=open]:animate-drawer-in"
        >
          <div className="flex items-center justify-between gap-4 border-b border-border-muted px-4 py-3">
            <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <IconButton label={closeLabel}>
                <X aria-hidden />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
