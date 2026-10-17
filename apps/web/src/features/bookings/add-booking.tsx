'use client'

import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { Field } from '@muni/ui/field'
import { Select } from '@muni/ui/select'
import { UserPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'

import { useToast } from '@/components/toasts'
import { useAfterWrite } from '@/lib/query/use-after-write'
import { addBookingAction, type BookingState } from '@/server/actions/assignments'

const IDLE: BookingState = { status: 'idle' }

/**
 * Books by hand: on a session's page, a person; on a person's page, a session. The server
 * checks every rule (seats, status, clashes) and says why when it refuses.
 */
export function AddBookingForm({
  fixed,
  field,
  label,
  options,
}: {
  fixed: { sessionExternalId: string } | { employeeExternalId: string }
  /** What the form chooses. */
  field: 'employeeExternalId' | 'sessionExternalId'
  label: string
  options: { value: string; label: string }[]
}) {
  const t = useTranslations()
  // A booked choice leaves the list; the select starts over.
  const [round, setRound] = useState(0)
  const afterWrite = useAfterWrite('booking')
  const toast = useToast()
  const [state, formAction, pending] = useActionState(
    async (previous: BookingState, form: FormData): Promise<BookingState> => {
      const chosen = options.find(o => o.value === form.get(field))?.label ?? ''
      try {
        const next = await addBookingAction(fixed, previous, form)
        if (next.status === 'done') {
          setRound(r => r + 1)
          afterWrite()
          toast({ title: t('bookings.booked', { what: chosen }) })
        }
        return next
      } catch {
        toast({ tone: 'danger', title: t('common.failed') })
        return IDLE
      }
    },
    IDLE
  )
  if (options.length === 0) return <p className="text-sm text-fg-muted">{t('bookings.noneLeft')}</p>
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field
          label={label}
          required
          error={
            state.status === 'refused' && state.reason === 'invalid'
              ? t('bookings.choose')
              : undefined
          }
          className="min-w-0 flex-1"
        >
          {control => (
            <Select
              key={round}
              {...control}
              name={field}
              options={options}
              placeholder={t('common.choose')}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          <UserPlus aria-hidden />
          {t('bookings.add')}
        </Button>
      </div>
      {state.status === 'refused' && state.reason !== 'invalid' && (
        <Alert tone="danger">
          {t('bookings.refused', { reason: t(`advisor.outcome.reasons.${state.reason}`) })}
        </Alert>
      )}
    </form>
  )
}
