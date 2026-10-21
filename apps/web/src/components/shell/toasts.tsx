'use client'

import { buttonClass } from '@muni/ui/button'
import { Toast, ToastProvider, type ToastTone, ToastViewport } from '@muni/ui/toast'
import { useTranslations } from 'next-intl'
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react'

import { Link } from '@/components/navigation/link'

/** A message about a write that just finished. */
export interface ToastMessage {
  tone?: ToastTone | undefined
  title: string
  description?: string | undefined
  /** A shortcut to what was written ("Open session"); the page offers it too. */
  action?: { label: string; href: string } | undefined
}

const ToastContext = createContext<(message: ToastMessage) => void>(() => undefined)

/**
 * The app's toasts. They live in the root layout, above the pages, so a write that navigates
 * (save, then go to the record) still shows its message on the page it lands on.
 */
export function ToastsProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('common')
  const [toasts, setToasts] = useState<(ToastMessage & { id: number; open: boolean })[]>([])
  const show = useCallback((message: ToastMessage) => {
    setToasts(current => [...current, { ...message, id: Date.now() + current.length, open: true }])
  }, [])
  const close = (id: number) => {
    setToasts(current => current.filter(item => item.id !== id))
  }
  return (
    <ToastProvider label={t('notifications')}>
      <ToastContext value={show}>{children}</ToastContext>
      {toasts.map(item => (
        <Toast
          key={item.id}
          open={item.open}
          onOpenChange={open => {
            if (!open) close(item.id)
          }}
          tone={item.tone}
          title={item.title}
          description={item.description}
          closeLabel={t('close')}
          actionAltText={item.action?.label}
          action={
            item.action && (
              <Link
                href={item.action.href}
                className={buttonClass({
                  variant: 'secondary',
                  size: 'sm',
                  className: 'self-start',
                })}
              >
                {item.action.label}
              </Link>
            )
          }
        />
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}

/** Shows a toast: `toast({ title: 'Saved' })`. */
export function useToast(): (message: ToastMessage) => void {
  return useContext(ToastContext)
}
