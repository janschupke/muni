'use client'

import { checkMoves, type OverbookedSession } from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { ChoiceGroup } from '@muni/ui/choice-group'
import { EmptyState } from '@muni/ui/empty-state'
import { Field, Input } from '@muni/ui/field'
import { formatSessionTime } from '@muni/utils/format'
import { parseCount } from '@muni/utils/money'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ConfirmDialog, type ConfirmOutcome } from '@/components/feedback/confirm-dialog'
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
  const te = useTranslations('forms.errors')
  const tr = useTranslations('advisor.overbooked.refused')
  const afterWrite = useAfterWrite('session')
  const { session } = o
  const named = session.assigned.length
  const movable = session.unnamedBookings
  const canMove = movable > 0 && o.targets.length > 0
  const [way, setWay] = useState<Way>(canMove || o.raiseTo === null ? 'move' : 'raise')
  const [counts, setCounts] = useState<ReadonlyMap<string, string>>(
    () => new Map(o.moves.map(m => [m.to.externalId, String(m.count)]))
  )

  // What the typed counts come to (`checkMoves`), and what is wrong with them.
  const { moves, total, overTarget, tooMany, ready } = checkMoves(
    o,
    new Map([...counts].map(([id, text]) => [id, countOf(text)]))
  )
  // What is wrong with one count goes on its field; the total, under them all.
  const fieldError = ({ target, count }: (typeof moves)[number]) =>
    count === null
      ? te('not_a_number')
      : count > target.free
        ? t('overField', { free: target.free })
        : undefined
  // Nothing typed wrong: the dialog can say what the session comes to.
  const clean = moves.every(m => m.count !== null) && overTarget.length === 0 && !tooMany
  const moveReady = canMove && ready
  const after = o.booked - total
  const raiseTo = o.raiseTo

  const confirm = async (): Promise<ConfirmOutcome> => {
    const name = `${session.courseName}, ${formatSessionTime(session)}`
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
      title={t('title', { course: session.courseName, date: formatSessionTime(session) })}
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
                    date: formatSessionTime(target.session),
                    room: target.session.room.name,
                  })}
                  help={t('free', { free: target.free })}
                  error={fieldError(moves.find(m => m.target === target) ?? { target, count: 0 })}
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
            {tooMany && <Alert tone="danger">{t('tooMany', { count: movable })}</Alert>}
            {clean &&
              (total === 0 ? (
                <EmptyState variant="inline" title={t('nothing')} />
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
