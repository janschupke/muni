'use client'

import { type OverbookedSession } from '@muni/domain/advisor'
import { ChoiceGroup } from '@muni/ui/choice-group'
import { formatSessionTime } from '@muni/utils/format'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ConfirmDialog, type ConfirmOutcome } from '@/components/feedback/confirm-dialog'
import { useAfterWrite } from '@/lib/query/use-after-write'
import { resolveOverbookingAction } from '@/server/actions/assignments'

import { MovePanel, RaisePanel } from './resolve-panels'
import { useMoveCounts } from './use-move-counts'

type Way = 'move' | 'raise'

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
  const afterWrite = useAfterWrite('session')
  const { session } = o
  const named = session.assigned.length
  const movable = session.unnamedBookings
  const canMove = movable > 0 && o.targets.length > 0
  const [way, setWay] = useState<Way>(canMove || o.raiseTo === null ? 'move' : 'raise')
  const counts = useMoveCounts(o)
  const { moves, total } = counts
  const moveReady = canMove && counts.ready
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
      {way === 'move' ? <MovePanel o={o} counts={counts} /> : <RaisePanel o={o} />}
    </ConfirmDialog>
  )
}
