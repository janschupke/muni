'use client'

import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { Dialog } from '@muni/ui/dialog'
import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'

import type { DeleteState } from '@/lib/form'

const IDLE: DeleteState = { status: 'idle' }

/**
 * Deleting a record asks first; a record still in use stays, and the page says why. The
 * strings come from the record's form messages (`rooms.form`, `providers.form`): `delete`,
 * `deleteHint`, `confirmTitle`, `confirmBody`, `confirm` and `inUse`.
 */
export function ConfirmDeleteButton({
  name,
  messages,
  action,
}: {
  name: string
  messages: 'rooms.form' | 'providers.form'
  action: (state: DeleteState) => Promise<DeleteState>
}) {
  const t = useTranslations()
  const tm = useTranslations(messages)
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(async (previous: DeleteState) => {
    // Deleted, the action leaves the page; refused, the reason shows below the button.
    const next = await action(previous)
    setOpen(false)
    return next
  }, IDLE)
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      {state.status === 'refused' && (
        <Alert tone="danger">
          {state.reason === 'in_use' ? tm('inUse') : t(`forms.errors.${state.reason}`)}
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            setOpen(true)
          }}
        >
          <Trash2 aria-hidden />
          {tm('delete')}
        </Button>
        <span className="text-xs text-fg-muted">{tm('deleteHint')}</span>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={tm('confirmTitle', { name })}
        description={tm('confirmBody')}
        closeLabel={t('common.close')}
      >
        <form action={formAction} className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOpen(false)
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="danger" disabled={pending}>
            <Trash2 aria-hidden />
            {tm('confirm')}
          </Button>
        </form>
      </Dialog>
    </div>
  )
}
