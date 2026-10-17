'use client'

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { Toast as ToastPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '../cn'

export type ToastTone = 'success' | 'info' | 'warning' | 'danger'

const ICON = { success: CircleCheck, info: Info, warning: TriangleAlert, danger: CircleAlert }
const INK = {
  success: 'text-success-fg',
  info: 'text-info-fg',
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
}

/** How long a toast stays: a failure stays until it is closed, everything else 6 s. */
export const toastDuration = (tone: ToastTone) => (tone === 'danger' ? Infinity : 6000)

/**
 * Wraps the app: toasts are announced politely through Radix's live region (`label` names
 * the region for screen readers, "Notifications"), F8 moves focus to them, and a swipe to the
 * right dismisses one.
 */
export function ToastProvider({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ToastPrimitive.Provider label={label} swipeDirection="right" duration={6000}>
      {children}
    </ToastPrimitive.Provider>
  )
}

/** Where toasts stack: the bottom-right corner, newest at the bottom. */
export function ToastViewport() {
  return (
    <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 outline-none" />
  )
}

/**
 * One message about something that just happened (saved, booked, failed). It never carries
 * the only way to do something: its action is a shortcut ("Open session") that the page also
 * offers, which is what `actionAltText` tells screen readers.
 */
export function Toast({
  tone = 'success',
  title,
  description,
  action,
  actionAltText,
  closeLabel,
  open,
  onOpenChange,
}: {
  tone?: ToastTone | undefined
  title: ReactNode
  description?: ReactNode | undefined
  /** A link or button (rendered as is). */
  action?: ReactNode | undefined
  actionAltText?: string | undefined
  closeLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const Icon = ICON[tone]
  return (
    <ToastPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      duration={toastDuration(tone)}
      // A failure interrupts; the rest wait their turn.
      type={tone === 'danger' ? 'foreground' : 'background'}
      className="flex items-start gap-3 rounded-md border border-border-default bg-surface-overlay p-3 text-fg shadow-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-slide-up data-[swipe=end]:animate-fade-out data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)"
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', INK[tone])} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <ToastPrimitive.Title className="text-sm font-medium">{title}</ToastPrimitive.Title>
        {description !== undefined && (
          <ToastPrimitive.Description className="text-sm text-fg-muted">
            {description}
          </ToastPrimitive.Description>
        )}
        {action !== undefined && actionAltText !== undefined && (
          <ToastPrimitive.Action asChild altText={actionAltText}>
            {action}
          </ToastPrimitive.Action>
        )}
      </div>
      <ToastPrimitive.Close
        aria-label={closeLabel}
        className="-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-state-hover hover:text-fg"
      >
        <X aria-hidden className="size-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  )
}
