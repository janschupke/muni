'use client'

import type { RoomOption } from '@muni/db/repositories'
import type { SessionOffer } from '@muni/domain/planner'
import type { SessionNeeds } from '@muni/domain/rooms'
import { sessionIssues } from '@muni/domain/sessions'
import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { Checkbox } from '@muni/ui/checkbox'
import { DatePicker } from '@muni/ui/date-picker'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { Dialog } from '@muni/ui/dialog'
import { Field, FieldRow, Input } from '@muni/ui/field'
import { Select } from '@muni/ui/select'
import { TimePicker } from '@muni/ui/time-picker'
import { isWorkingDay, todayIn, zonedTimeToUtc } from '@muni/utils/dates'
import {
  currencySymbol,
  formatCurrency,
  formatDate,
  formatTimeRange,
  PLACEHOLDER,
} from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState, useTransition } from 'react'

import { useDateLabels, useRoomLabel, useTimeLabels } from '@/components/form/session-fields'
import { useToast } from '@/components/toasts'
import { useAfterWrite } from '@/lib/query/use-after-write'
import {
  checkSessionSlotAction,
  createPlannedSessionAction,
  type PlannedOutcome,
} from '@/server/actions/sessions'

/** A typed whole number, or null while it is not one. */
const wholeOf = (text: string): number | null =>
  /^\s*\d+\s*$/.test(text) ? Number(text.trim()) : null

/** A typed price (`450`, `450,50`): undefined while it is not one, null when empty. */
const priceOf = (text: string): number | null | undefined => {
  const cleaned = text.replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') return null
  return /^\d+(\.\d{1,2})?$/.test(cleaned) ? Number(cleaned) : undefined
}

/**
 * A planner offer turned into a session: everything can change (day, times, room, seats,
 * price, who is booked), then the server checks it all without writing (the same
 * transaction, undone), the user reviews exactly what will be created, and confirms. Only
 * then is the session created and the people booked, all or nothing.
 */
export function OfferReview({
  offer,
  rooms,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  offer: SessionOffer
  rooms: readonly RoomOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo?: (() => HTMLElement | null | undefined) | undefined
}) {
  const t = useTranslations('planner.review')
  const tf = useTranslations('forms.session')
  const te = useTranslations('forms.errors')
  const tr = useTranslations('planner.refused')
  const tc = useTranslations('common')
  const reasons = useTranslations('advisor.outcome.reasons')
  const locale = useLocale()
  const toast = useToast()
  const afterWrite = useAfterWrite()
  const dateLabels = useDateLabels()
  const timeLabels = useTimeLabels()
  const roomLabel = useRoomLabel()
  const [pending, startTransition] = useTransition()
  // Which request is out: each button says "working" only for its own.
  const [sending, setSending] = useState<'check' | 'create' | null>(null)

  const needs: SessionNeeds = {
    groupSize: offer.course.groupSize,
    onlineAllowed: offer.course.onlineAllowed,
    capabilities: offer.course.capabilities,
  }
  const [date, setDate] = useState(offer.slot?.date ?? '')
  const [startTime, setStartTime] = useState(offer.slot?.startTime ?? '')
  const [endTime, setEndTime] = useState(offer.slot?.endTime ?? '')
  const [roomId, setRoomId] = useState(offer.room?.id ?? '')
  const [capacity, setCapacity] = useState(String(offer.capacity ?? offer.size))
  const [price, setPrice] = useState('')
  const [people, setPeople] = useState<ReadonlySet<string>>(
    () => new Set(offer.people.map(p => p.externalId))
  )
  const [stage, setStage] = useState<'edit' | 'review'>('edit')
  const [answer, setAnswer] = useState<PlannedOutcome | null>(null)

  const room = rooms.find(r => r.id === roomId)
  const seats = wholeOf(capacity)
  const pricePerPerson = priceOf(price)
  const issues = sessionIssues({
    startTime,
    endTime,
    capacity: seats,
    booked: people.size,
    planned: true,
    room: room ?? null,
    needs,
  })

  // Whether another session holds the room then: asked as the user picks.
  const slot = `${roomId}|${date}|${startTime}|${endTime}`
  const [busy, setBusy] = useState<{ slot: string; busy: boolean } | null>(null)
  const asks = room !== undefined && room.kind !== 'ONLINE' && date !== '' && endTime > startTime
  useEffect(() => {
    if (!asks) return
    const timer = setTimeout(() => {
      void checkSessionSlotAction({ roomId, date, startTime, endTime }, null).then(found => {
        setBusy({ slot, busy: found === 'ROOM_BUSY' })
      })
    }, 400)
    return () => {
      clearTimeout(timer)
    }
  }, [asks, slot, roomId, date, startTime, endTime])

  const endError = issues.some(i => i.kind === 'END_BEFORE_START') ? te('before_start') : undefined
  const mismatch = issues.find(i => i.kind === 'ROOM')
  const roomError =
    mismatch?.kind === 'ROOM'
      ? `${room?.name ?? ''}: ${tf(`unfit.${mismatch.mismatch.kind}`)}`
      : busy?.slot === slot && busy.busy && asks
        ? te('room_busy')
        : undefined
  const capacityError =
    seats === null || seats < 1
      ? te('not_a_number')
      : issues.some(i => i.kind === 'BELOW_BOOKED')
        ? t('capacityLow', { count: people.size })
        : undefined
  const priceError = pricePerPerson === undefined ? te('not_a_number') : undefined
  const ready =
    date !== '' &&
    room !== undefined &&
    !endError &&
    !roomError &&
    !capacityError &&
    !priceError &&
    !pending

  const warnings = [
    ...(date !== '' && !isWorkingDay(date)
      ? [t('notWorking', { date: formatDate(date, locale) })]
      : []),
    ...(date > offer.deadline ? [t('late', { deadline: formatDate(offer.deadline, locale) })] : []),
  ]

  // Any change starts the check over.
  const edit = (apply: () => void) => {
    apply()
    setAnswer(null)
    setStage('edit')
  }

  const request = (dryRun: boolean) => ({
    session: {
      courseId: offer.course.id,
      date,
      startTime,
      endTime,
      roomId,
      capacity: seats ?? 0,
      pricePerPerson: pricePerPerson ?? null,
      status: 'PLANNED' as const,
    },
    people: [...people],
    dryRun,
  })

  const send = (dryRun: boolean) => {
    setSending(dryRun ? 'check' : 'create')
    startTransition(async () => {
      const result: PlannedOutcome = await createPlannedSessionAction(request(dryRun)).catch(
        () => ({ ok: false as const, problem: 'failed' as const, refusals: [] as [] })
      )
      setSending(null)
      setAnswer(result)
      if (!result.ok) {
        setStage('edit')
        return
      }
      if (dryRun) {
        setStage('review')
        return
      }
      afterWrite()
      toast({
        title: t('created', { id: result.externalId, count: result.booked }),
        action: { label: t('openSession'), href: `/sessions/${result.externalId}` },
      })
      onOpenChange(false)
    })
  }

  const nameOf = (externalId: string) =>
    offer.people.find(p => p.externalId === externalId)?.name ?? externalId
  const chosen = offer.people.filter(p => people.has(p.externalId))
  const when =
    date && startTime && endTime
      ? formatTimeRange(
          zonedTimeToUtc(date, startTime).toISOString(),
          zonedTimeToUtc(date, endTime).toISOString(),
          locale
        )
      : PLACEHOLDER

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!pending) onOpenChange(next)
      }}
      title={t('title', { course: offer.course.name })}
      description={t('intro')}
      closeLabel={tc('close')}
      returnFocusTo={returnFocusTo}
      className="max-w-3xl"
      footer={
        stage === 'edit' ? (
          <>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                onOpenChange(false)
              }}
            >
              {tc('keepAsIs')}
            </Button>
            <Button
              variant="primary"
              disabled={!ready}
              onClick={() => {
                send(true)
              }}
            >
              {sending === 'check' ? t('checking') : t('check')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setStage('edit')
              }}
            >
              {t('back')}
            </Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => {
                send(false)
              }}
            >
              {sending === 'create' ? t('creating') : t('confirm', { count: chosen.length })}
            </Button>
          </>
        )
      }
    >
      {stage === 'review' ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">{t('summaryTitle')}</h3>
          <DescriptionList>
            <DescriptionItem label={t('course')}>{offer.course.name}</DescriptionItem>
            <DescriptionItem label={t('when')}>{when}</DescriptionItem>
            <DescriptionItem label={t('room')}>{room?.name ?? PLACEHOLDER}</DescriptionItem>
            <DescriptionItem label={t('capacity')}>{seats ?? PLACEHOLDER}</DescriptionItem>
            <DescriptionItem label={t('price')}>
              {pricePerPerson == null ? PLACEHOLDER : formatCurrency(pricePerPerson, locale)}
            </DescriptionItem>
            <DescriptionItem label={t('booked')}>
              {chosen.length === 0 ? (
                t('nobody')
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {chosen.map(p => (
                    <li key={p.externalId}>{p.name}</li>
                  ))}
                </ul>
              )}
            </DescriptionItem>
            <DescriptionItem label={t('total')}>
              {pricePerPerson == null
                ? PLACEHOLDER
                : formatCurrency(pricePerPerson * chosen.length, locale)}
            </DescriptionItem>
          </DescriptionList>
          {warnings.map(w => (
            <Alert key={w} tone="warning">
              {w}
            </Alert>
          ))}
        </div>
      ) : (
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
                    {t('refusal', {
                      name: nameOf(r.employeeExternalId),
                      reason: reasons(r.reason),
                    })}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          <FieldRow>
            <Field label={tf('date')} required>
              {control => (
                <DatePicker
                  {...control}
                  value={date}
                  onValueChange={value => {
                    edit(() => {
                      setDate(value)
                    })
                  }}
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
              error={roomError}
              help={room?.capacity != null ? tf('roomHolds', { seats: room.capacity }) : undefined}
            >
              {control => (
                <Select
                  {...control}
                  value={roomId}
                  onValueChange={value => {
                    edit(() => {
                      setRoomId(value)
                    })
                  }}
                  options={rooms.map(r => ({
                    value: r.id,
                    label: roomLabel(r, needs, seats),
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
                  value={startTime}
                  onValueChange={value => {
                    edit(() => {
                      setStartTime(value)
                    })
                  }}
                  labels={timeLabels(tf('startTime'))}
                />
              )}
            </Field>
            <Field label={tf('endTime')} required error={endError}>
              {control => (
                <TimePicker
                  {...control}
                  value={endTime}
                  onValueChange={value => {
                    edit(() => {
                      setEndTime(value)
                    })
                  }}
                  labels={timeLabels(tf('endTime'))}
                />
              )}
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label={tf('capacity')} required error={capacityError}>
              {control => (
                <Input
                  {...control}
                  inputMode="numeric"
                  value={capacity}
                  onChange={event => {
                    const value = event.target.value
                    edit(() => {
                      setCapacity(value)
                    })
                  }}
                />
              )}
            </Field>
            <Field
              label={tf('pricePerPerson', { currency: currencySymbol(locale) })}
              error={priceError}
            >
              {control => (
                <Input
                  {...control}
                  inputMode="decimal"
                  placeholder="0"
                  value={price}
                  onChange={event => {
                    const value = event.target.value
                    edit(() => {
                      setPrice(value)
                    })
                  }}
                />
              )}
            </Field>
          </FieldRow>
          {warnings.map(w => (
            <Alert key={w} tone="warning" variant="inline">
              {w}
            </Alert>
          ))}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t('people')}</legend>
            <p className="text-xs text-fg-muted">{t('peopleHelp', { count: people.size })}</p>
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
                          p.lapses
                            ? t('lapses', { date: formatDate(p.lapses, locale) })
                            : t('neverHeld'),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </>
                  }
                  checked={people.has(p.externalId)}
                  onCheckedChange={on => {
                    edit(() => {
                      setPeople(current => {
                        const next = new Set(current)
                        if (on) next.add(p.externalId)
                        else next.delete(p.externalId)
                        return next
                      })
                    })
                  }}
                />
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </Dialog>
  )
}
