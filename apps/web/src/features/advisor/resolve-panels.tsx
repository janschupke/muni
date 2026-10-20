'use client'

import type { OverbookedSession } from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { EmptyState } from '@muni/ui/empty-state'
import { Field, Input } from '@muni/ui/field'
import { formatSessionTime } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import type { MoveCounts } from './use-move-counts'

/**
 * Moving seats booked without a name: how many to each session of the course with room, and
 * what the session comes to; or why there is nothing to move, or nowhere to move it.
 */
export function MovePanel({ o, counts }: { o: OverbookedSession; counts: MoveCounts }) {
  const t = useTranslations('advisor.overbooked.dialog')
  const { session } = o
  const movable = session.unnamedBookings
  if (movable === 0) return <Alert tone="warning">{t('noUnnamed')}</Alert>
  if (o.targets.length === 0) return <Alert tone="warning">{t('noTargets')}</Alert>
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {o.targets.map(target => {
          const id = target.session.externalId
          return (
            <Field
              key={id}
              label={t('target', {
                date: formatSessionTime(target.session),
                room: target.session.room.name,
              })}
              help={t('free', { free: target.free })}
              error={counts.fieldError(id)}
            >
              {control => (
                <Input
                  {...control}
                  inputMode="numeric"
                  placeholder="0"
                  value={counts.text(id)}
                  onChange={event => {
                    counts.type(id, event.target.value)
                  }}
                />
              )}
            </Field>
          )
        })}
      </div>
      {counts.tooMany && <Alert tone="danger">{t('tooMany', { count: movable })}</Alert>}
      {counts.clean && counts.total === 0 && <EmptyState variant="inline" title={t('nothing')} />}
      {counts.clean && counts.total > 0 && (
        <p className="text-sm font-medium">
          {t('after', {
            booked: counts.after,
            capacity: session.capacity,
            over: Math.max(0, counts.after - session.capacity),
          })}
        </p>
      )}
    </div>
  )
}

/** Raising the capacity to fit everyone: to what, in which room; or why the room cannot. */
export function RaisePanel({ o }: { o: OverbookedSession }) {
  const t = useTranslations('advisor.overbooked.dialog')
  const { session, raiseTo } = o
  if (raiseTo === null)
    return (
      <Alert tone="warning">
        {t('raiseNo', {
          room: session.room.name,
          seats: session.roomCapacity ?? 0,
          booked: o.booked,
        })}
      </Alert>
    )
  return (
    <p className="text-sm font-medium">
      {session.roomCapacity === null
        ? t('raiseOnline', { room: session.room.name, capacity: session.capacity, to: raiseTo })
        : t('raiseRoom', {
            room: session.room.name,
            seats: session.roomCapacity,
            capacity: session.capacity,
            to: raiseTo,
          })}
    </p>
  )
}
