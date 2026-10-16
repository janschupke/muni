'use client'

import { Button } from '@muni/ui/button'
import { Dialog } from '@muni/ui/dialog'
import { IconButton } from '@muni/ui/icon-button'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState, useTransition } from 'react'

import { removeAssignmentAction } from '@/server/actions/assignments'

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
  const t = useTranslations('common')
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  return (
    <>
      <IconButton
        ref={trigger}
        label={label}
        disabled={pending}
        onClick={() => {
          setOpen(true)
        }}
      >
        <X aria-hidden />
      </IconButton>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={confirmTitle}
        closeLabel={t('close')}
        returnFocusTo={() => trigger.current}
      >
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false)
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await removeAssignmentAction({ sessionExternalId, employeeExternalId })
                setOpen(false)
              })
            }}
          >
            <X aria-hidden />
            {t('remove')}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
