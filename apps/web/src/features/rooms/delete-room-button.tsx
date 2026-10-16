'use client'

import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useActionState } from 'react'

import { IDLE, type FormState } from '@/lib/form'

export function DeleteRoomButton({ action }: { action: (state: FormState) => Promise<FormState> }) {
  const t = useTranslations()
  const [state, formAction, pending] = useActionState(action, IDLE)
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-2">
      {state.status === 'error' && state.formError && (
        <Alert tone="danger">{t(`forms.errors.${state.formError}`)}</Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="danger" disabled={pending}>
          <Trash2 aria-hidden />
          {t('rooms.form.delete')}
        </Button>
        <span className="text-xs text-fg-muted">{t('rooms.form.deleteHint')}</span>
      </div>
    </form>
  )
}
