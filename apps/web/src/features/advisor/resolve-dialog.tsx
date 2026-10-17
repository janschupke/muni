'use client'

import type { AdvisorSession, OverbookedSession } from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { ChoiceGroup } from '@muni/ui/choice-group'
import { Field, Input } from '@muni/ui/field'
import { formatTimeRange } from '@muni/utils/format'
import { parseCount } from '@muni/utils/money'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { ConfirmDialog, type ConfirmOutcome } from '@/components/confirm-dialog'
import { useAfterWrite } from '@/lib/query/use-after-write'
import { resolveOverbookingAction } from '@/server/actions/assignments'

type Way = 'move' | 'raise'

/** A typed count: empty is none moved; null while it is not a whole number. */
const countOf = (text: string): number | null => (text.trim() === '' ? 0 : parseCount(text))

/**
 * How to resolve one overbooked session, chosen by the admin: move seats booked without a
 * name to other sessions of the course (how many to each; the suggestion fills it in), or
 * raise the capacity when the room has the seats. The dialog says what each does and what
 * the session looks like afterwards; the confirm button names the change.
 */
export function ResolveDialog({
  overbooked: o,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  overbooked: OverbookedSession
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo?: (() => HTMLElement | null | undefined) | undefined
}) {
  const t = useTranslations('advisor.overbooked.dialog')
  const tr = useTranslations('advisor.overbooked.refused')
  const locale = useLocale()
  const afterWrite = useAfterWrite('session')
  const { session } = o
  const when = (s: AdvisorSession) => formatTimeRange(s.startsAt, s.endsAt, locale)
  const named = session.assigned.length
  const movable = session.unnamedBookings
  const canMove = movable > 0 && o.targets.length > 0
  const [way, setWay] = useState<Way>(canMove || o.raiseTo === null ? 'move' : 'raise')
  const [counts, setCounts] = useState<ReadonlyMap<string, string>>(
    () => new Map(o.moves.map(m => [m.to.externalId, String(m.count)]))
  )

  // What the typed counts come to, and what is wrong with them.
  const moves = o.targets.map(target => ({
    target,
    count: countOf(counts.get(target.session.externalId) ?? ''),
  }))
  const total = moves.reduce((sum, m) => sum + (m.count ?? 0), 0)
  const problems = [
    ...moves.flatMap(({ target, count }) =>
      count !== null && count > target.free
        ? [
            t('overTarget', {
              session: `${target.session.courseName}, ${when(target.session)}`,
              free: target.free,
            }),
          ]
        : []
    ),
    ...(total > movable ? [t('tooMany', { count: movable })] : []),
  ]
  const typedWell = moves.every(m => m.count !== null)
  const moveReady = canMove && typedWell && total > 0 && problems.length === 0
  const after = o.booked - total
  const raiseTo = o.raiseTo

  const confirm = async (): Promise<ConfirmOutcome> => {
    const name = `${session.courseName}, ${when(session)}`
    if (way === 'raise') {
      // The button is off while the room is too small; this only answers a stale click.
      if (raiseTo === null) return { kind: 'refused', message: tr('ROOM_TOO_SMALL') }
      const raised = await resolveOverbookingAction({
        from: session.externalId,
        resolution: { kind: 'raise', capacity: raiseTo },
      })
      if (!raised.ok) return { kind: 'refused', message: tr(raised.reason) }
      afterWrite()
      return { kind: 'done', toast: { title: t('raised', { session: name, to: raiseTo }) } }
    }
    const moved = await resolveOverbookingAction({
      from: session.externalId,
      resolution: {
        kind: 'move',
        moves: moves.flatMap(m =>
          m.count ? [{ to: m.target.session.externalId, count: m.count }] : []
        ),
      },
    })
    if (!moved.ok) return { kind: 'refused', message: tr(moved.reason) }
    afterWrite()
    return { kind: 'done', toast: { title: t('moved', { count: total, session: name }) } }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title', { course: session.courseName, date: when(session) })}
      confirmLabel={
        way === 'raise'
          ? raiseTo === null
            ? t('raise')
            : t('confirmRaise', { to: raiseTo })
          : t('confirmMove', { count: total })
      }
      disabled={way === 'raise' ? raiseTo === null : !moveReady}
      onConfirm={confirm}
      returnFocusTo={returnFocusTo}
    >
      <div className="flex flex-col gap-1 text-sm">
        <p>
          {t('explain', {
            booked: o.booked,
            capacity: session.capacity,
            excess: o.excess,
            named,
            unnamed: movable,
          })}
        </p>
        <p className="text-fg-muted">{t('namedStay')}</p>
      </div>
      <ChoiceGroup
        label={t('how')}
        value={way}
        onValueChange={setWay}
        choices={[
          {
            value: 'move',
            title: t('move'),
            description: movable > 0 ? t('moveHint', { count: movable }) : t('noUnnamed'),
          },
          { value: 'raise', title: t('raise'), description: t('raiseHint') },
        ]}
      />
      {way === 'move' ? (
        movable === 0 ? (
          <Alert tone="warning">{t('noUnnamed')}</Alert>
        ) : o.targets.length === 0 ? (
          <Alert tone="warning">{t('noTargets')}</Alert>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {o.targets.map(target => (
                <Field
                  key={target.session.externalId}
                  label={t('target', {
                    date: when(target.session),
                    room: target.session.room.name,
                  })}
                  help={t('free', { free: target.free })}
                >
                  {control => (
                    <Input
                      {...control}
                      inputMode="numeric"
                      placeholder="0"
                      value={counts.get(target.session.externalId) ?? ''}
                      onChange={event => {
                        const value = event.target.value
                        setCounts(current => new Map(current).set(target.session.externalId, value))
                      }}
                    />
                  )}
                </Field>
              ))}
            </div>
            {problems.map(problem => (
              <Alert key={problem} tone="danger">
                {problem}
              </Alert>
            ))}
            {problems.length === 0 &&
              (total === 0 ? (
                <p className="text-sm text-fg-muted">{t('nothing')}</p>
              ) : (
                <p className="text-sm font-medium">
                  {t('after', {
                    booked: after,
                    capacity: session.capacity,
                    over: Math.max(0, after - session.capacity),
                  })}
                </p>
              ))}
          </div>
        )
      ) : raiseTo === null ? (
        <Alert tone="warning">
          {t('raiseNo', {
            room: session.room.name,
            seats: session.roomCapacity ?? 0,
            booked: o.booked,
          })}
        </Alert>
      ) : (
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
      )}
    </ConfirmDialog>
  )
}
