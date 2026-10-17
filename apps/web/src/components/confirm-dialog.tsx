'use client'

import { Alert } from '@muni/ui/alert'
import { Button, CancelButton } from '@muni/ui/button'
import { Dialog } from '@muni/ui/dialog'
import { useTranslations } from 'next-intl'
import { type ReactNode, useState, useTransition } from 'react'

import { type ToastMessage, useToast } from './toasts'

/**
 * What a confirmed write came to:
 * - `done`: it went through; the dialog closes and the toast says so;
 * - `refused`: nothing was written; the reason shows in the dialog, which stays open;
 * - `partial`: some of it was written and some refused; the dialog stays open to list what
 *   was refused, and offers only Close (there is nothing left to confirm);
 * - `go`: the decision is taken and the caller goes on to write and report (a form's save,
 *   whose answer shows on the form); the dialog just closes.
 */
export type ConfirmOutcome =
  | { kind: 'go' }
  | { kind: 'done'; toast: ToastMessage }
  | { kind: 'refused'; message: ReactNode }
  | { kind: 'partial'; toast: ToastMessage; message: ReactNode }

/**
 * A decision before a write that cannot be undone, touches many records, costs money or does
 * more than its button shows. The body says exactly what will change; the confirm button
 * names the act ("Book 3 people", "Cancel booking"); the other one keeps things as they are.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  disabled = false,
  onConfirm,
  returnFocusTo,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode | undefined
  confirmLabel: string
  /** Default: "Keep as is". */
  cancelLabel?: string | undefined
  tone?: 'primary' | 'danger' | undefined
  /** The choices in the body are not complete or valid yet. */
  disabled?: boolean | undefined
  onConfirm: () => Promise<ConfirmOutcome>
  returnFocusTo?: (() => HTMLElement | null | undefined) | undefined
  className?: string | undefined
  children: ReactNode
}) {
  const t = useTranslations('common')
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [problem, setProblem] = useState<ReactNode>(null)
  const [finished, setFinished] = useState(false)

  const change = (next: boolean) => {
    if (pending) return
    if (!next) {
      setProblem(null)
      setFinished(false)
    }
    onOpenChange(next)
  }

  const confirm = () => {
    setProblem(null)
    startTransition(async () => {
      try {
        const outcome = await onConfirm()
        if (outcome.kind === 'refused') {
          setProblem(outcome.message)
          return
        }
        if (outcome.kind === 'go') {
          onOpenChange(false)
          return
        }
        toast(outcome.toast)
        if (outcome.kind === 'partial') {
          setProblem(outcome.message)
          setFinished(true)
          return
        }
        onOpenChange(false)
      } catch {
        setProblem(t('failed'))
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={change}
      title={title}
      description={description}
      closeLabel={t('close')}
      returnFocusTo={returnFocusTo}
      className={className}
      footer={
        finished ? (
          <Button
            variant="primary"
            onClick={() => {
              change(false)
            }}
          >
            {t('close')}
          </Button>
        ) : (
          <>
            <CancelButton
              disabled={pending}
              onClick={() => {
                change(false)
              }}
            >
              {cancelLabel ?? t('keepAsIs')}
            </CancelButton>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              disabled={disabled || pending}
              onClick={confirm}
            >
              {pending ? t('working') : confirmLabel}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {children}
        {problem !== null && <Alert tone={finished ? 'warning' : 'danger'}>{problem}</Alert>}
      </div>
    </Dialog>
  )
}
