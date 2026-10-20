'use client'

import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { EmptyState } from '@muni/ui/empty-state'
import { Field } from '@muni/ui/field'
import { Select } from '@muni/ui/select'
import { UserPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'

import { useToast } from '@/components/shell/toasts'
import { useAfterWrite } from '@/lib/query/use-after-write'
import { addBookingAction, type BookingState } from '@/server/actions/assignments'

const IDLE: BookingState = { status: 'idle' }

/**
 * Books a person on a session, from the session's page: the people offered are those who need
 * its course. The server checks every rule (seats, status, clashes, whether the training is
 * still due) and says why when it refuses.
 */
export function AddBookingForm({
  sessionExternalId,
  options,
  initial,
}: {
  sessionExternalId: string
  /** Who can be booked; 'loading' while that is read (the form shows, waiting). */
  options: { value: string; label: string }[] | 'loading'
  /**
   * The choice to start with, when a link named one; ignored when it is not on offer (already
   * booked, left) and after the first booking.
   */
  initial?: string | undefined
}) {
  const t = useTranslations()
  // A booked choice leaves the list; the select starts over.
  const [round, setRound] = useState(0)
  const afterWrite = useAfterWrite('booking')
  const toast = useToast()
  const loading = options === 'loading'
  const offered = loading ? [] : options
  const [state, formAction, pending] = useActionState(
    async (previous: BookingState, form: FormData): Promise<BookingState> => {
      const chosen = offered.find(o => o.value === form.get('employeeExternalId'))?.label ?? ''
      try {
        const next = await addBookingAction(sessionExternalId, previous, form)
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
  if (!loading && offered.length === 0)
    return <EmptyState variant="inline" title={t('bookings.noneNeed')} />
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field
          label={t('bookings.person')}
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
              key={`${String(round)}-${String(loading)}`}
              {...control}
              name="employeeExternalId"
              options={offered}
              disabled={loading}
              defaultValue={
                round === 0 && offered.some(o => o.value === initial) ? initial : undefined
              }
              placeholder={loading ? t('common.loading') : t('common.choose')}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" disabled={pending || loading}>
          <UserPlus aria-hidden />
          {pending ? t('bookings.booking') : t('bookings.add')}
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
