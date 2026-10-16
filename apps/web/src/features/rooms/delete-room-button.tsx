'use client'

import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { Dialog } from '@muni/ui/dialog'
import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'

import { IDLE, type FormState } from '@/lib/form'

/** Deleting a room asks first; a room still in use stays, and the page says why. */
export function DeleteRoomButton({
  name,
  action,
}: {
  name: string
  action: (state: FormState) => Promise<FormState>
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(async (previous: FormState) => {
    // Deleted, the action leaves the page; refused, the reason shows below the button.
    const next = await action(previous)
    setOpen(false)
    return next
  }, IDLE)
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      {state.status === 'error' && state.formError && (
        <Alert tone="danger">{t(`forms.errors.${state.formError}`)}</Alert>
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
          {t('rooms.form.delete')}
        </Button>
        <span className="text-xs text-fg-muted">{t('rooms.form.deleteHint')}</span>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('rooms.form.confirmTitle', { name })}
        description={t('rooms.form.confirmBody')}
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
            {t('rooms.form.confirm')}
          </Button>
        </form>
      </Dialog>
    </div>
  )
}
