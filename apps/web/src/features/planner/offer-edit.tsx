'use client'

import type { RoomOption } from '@muni/db/repositories'
import type { SessionOffer } from '@muni/domain/planner'
import { Alert } from '@muni/ui/alert'
import { Checkbox } from '@muni/ui/checkbox'
import { DatePicker } from '@muni/ui/date-picker'
import { Field, FieldRow, Input } from '@muni/ui/field'
import { Select } from '@muni/ui/select'
import { TimePicker } from '@muni/ui/time-picker'
import { todayIn } from '@muni/utils/dates'
import { currencySymbol, formatDate } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'

import { useDateLabels, useRoomLabel, useTimeLabels } from '@/components/form/session-fields'
import type { PlannedOutcome } from '@/server/actions/sessions'

import type { OfferDraft } from './use-offer-draft'

/** The offer's fields and the people to book, with why the server refused the last check. */
export function OfferEdit({
  offer,
  rooms,
  draft,
  answer,
}: {
  offer: SessionOffer
  rooms: readonly RoomOption[]
  draft: OfferDraft
  answer: PlannedOutcome | null
}) {
  const t = useTranslations('planner.review')
  const tf = useTranslations('forms.session')
  const tr = useTranslations('planner.refused')
  const reasons = useTranslations('advisor.outcome.reasons')
  const locale = useLocale()
  const dateLabels = useDateLabels()
  const timeLabels = useTimeLabels()
  const roomLabel = useRoomLabel()
  const { values, set, errors, room } = draft
  const nameOf = (externalId: string) =>
    offer.people.find(p => p.externalId === externalId)?.name ?? externalId

  return (
    <div className="flex flex-col gap-4">
      {answer && !answer.ok && answer.problem !== null && (
        <Alert tone="danger">{tr(answer.problem)}</Alert>
      )}
      {answer && !answer.ok && answer.refusals.length > 0 && (
        <Alert tone="danger">
          {t('refusedPeople')}
          <ul className="mt-1 flex flex-col gap-0.5">
            {answer.refusals.map(r => (
              <li key={r.employeeExternalId}>
                {t('refusal', { name: nameOf(r.employeeExternalId), reason: reasons(r.reason) })}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <FieldRow>
        <Field label={tf('date')} required error={errors.date}>
          {control => (
            <DatePicker
              {...control}
              value={values.date}
              onValueChange={set.date}
              min={todayIn()}
              today={todayIn()}
              locale={locale}
              labels={dateLabels(tf('date'))}
            />
          )}
        </Field>
        <Field
          label={tf('room')}
          required
          error={errors.roomId}
          help={room?.capacity != null ? tf('roomHolds', { seats: room.capacity }) : undefined}
        >
          {control => (
            <Select
              {...control}
              value={values.roomId}
              onValueChange={set.roomId}
              options={rooms.map(r => ({
                value: r.id,
                label: roomLabel(r, draft.needs, draft.seats),
              }))}
            />
          )}
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label={tf('startTime')} required>
          {control => (
            <TimePicker
              {...control}
              value={values.startTime}
              onValueChange={set.startTime}
              labels={timeLabels(tf('startTime'))}
            />
          )}
        </Field>
        <Field label={tf('endTime')} required error={errors.endTime}>
          {control => (
            <TimePicker
              {...control}
              value={values.endTime}
              onValueChange={set.endTime}
              labels={timeLabels(tf('endTime'))}
            />
          )}
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label={tf('capacity')} required error={errors.capacity}>
          {control => (
            <Input
              {...control}
              inputMode="numeric"
              value={values.capacity}
              onChange={event => {
                set.capacity(event.target.value)
              }}
            />
          )}
        </Field>
        <Field label={tf('pricePerPerson', { currency: currencySymbol() })} error={errors.price}>
          {control => (
            <Input
              {...control}
              inputMode="decimal"
              placeholder="0"
              value={values.price}
              onChange={event => {
                set.price(event.target.value)
              }}
            />
          )}
        </Field>
      </FieldRow>
      {draft.warnings.map(w => (
        <Alert key={w} tone="warning" variant="inline">
          {w}
        </Alert>
      ))}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('people')}</legend>
        <p className="text-xs text-fg-muted">{t('peopleHelp', { count: values.people.size })}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {offer.people.map(p => (
            <Checkbox
              key={p.externalId}
              label={
                <>
                  {p.name}
                  <span className="font-normal text-fg-muted">
                    {' · '}
                    {[
                      p.department,
                      p.lapses ? t('lapses', { date: formatDate(p.lapses) }) : t('neverHeld'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </>
              }
              checked={values.people.has(p.externalId)}
              onCheckedChange={on => {
                set.person({ externalId: p.externalId, on })
              }}
            />
          ))}
        </div>
      </fieldset>
    </div>
  )
}
