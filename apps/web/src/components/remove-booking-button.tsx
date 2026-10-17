'use client'

import { IconButton } from '@muni/ui/icon-button'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { useAfterWrite } from '@/lib/query/use-after-write'
import { removeAssignmentAction } from '@/server/actions/assignments'

import { ConfirmDialog } from './confirm-dialog'

/**
 * Cancels one named booking, after asking (admins only; the action checks again). The seat
 * goes back to the session; nothing else about the person changes.
 */
export function RemoveBookingButton({
  sessionExternalId,
  employeeExternalId,
  label,
  confirmTitle,
}: {
  sessionExternalId: string
  employeeExternalId: string
  /** The button's name: "Remove Novák Jan". */
  label: string
  /** The question: "Remove Novák Jan from this session?" */
  confirmTitle: string
}) {
  const t = useTranslations('bookings')
  const reasons = useTranslations('advisor.outcome.reasons')
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const afterWrite = useAfterWrite()
  return (
    <>
      <IconButton
        ref={trigger}
        label={label}
        onClick={() => {
          setOpen(true)
        }}
      >
        <X aria-hidden />
      </IconButton>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={confirmTitle}
        tone="danger"
        confirmLabel={t('cancel')}
        cancelLabel={t('keep')}
        returnFocusTo={() => trigger.current}
        onConfirm={async () => {
          const removed = await removeAssignmentAction({ sessionExternalId, employeeExternalId })
          if (removed.ok) {
            afterWrite()
            return { kind: 'done', toast: { title: t('cancelled') } }
          }
          // Gone already: the page is behind, so it catches up.
          if (removed.reason === 'gone') {
            afterWrite()
            return { kind: 'refused', message: t('alreadyGone') }
          }
          return { kind: 'refused', message: reasons(removed.reason) }
        }}
      >
        <p className="text-sm text-fg-muted">{t('removeBody')}</p>
      </ConfirmDialog>
    </>
  )
}
