'use client'

import type { OverbookedSession } from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { BarRow } from '@muni/ui/bar-row'
import { Button } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { EmptyState } from '@muni/ui/empty-state'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
import { Meter } from '@muni/ui/meter'
import { formatTimeRange } from '@muni/utils/format'
import { ArrowRightLeft } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

/** Sessions over capacity, with the seat moves that bring them back under it. */
export function OverbookedList({
  overbooked,
  onMove,
  pending,
}: {
  overbooked: OverbookedSession[]
  /** Signed-in only: applies all moves proposed for one session. */
  onMove?: (item: OverbookedSession) => void
  pending: boolean
}) {
  const t = useTranslations('advisor.overbooked')
  const locale = useLocale()
  if (overbooked.length === 0) return <EmptyState title={t('none')} />
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {overbooked.map(o => (
        <Card key={o.session.externalId}>
          <CardHeader
            title={`${o.session.courseName} · ${o.session.externalId}`}
            description={`${formatTimeRange(o.session.startsAt, o.session.endsAt, locale)} · ${o.session.location}`}
          />
          <CardBody className="flex flex-col gap-3 text-sm">
            <BarRow
              label={t('booked')}
              value={t('over', {
                booked: o.booked,
                capacity: o.session.capacity,
                excess: o.excess,
              })}
              bar={
                <Meter value={o.booked} max={o.session.capacity} label={t('booked')} size="md" />
              }
            />
            {o.moves.length > 0 && (
              <ItemList>
                {o.moves.map(m => (
                  <ItemListRow key={m.to.externalId}>
                    <span>
                      {t('move', {
                        count: m.count,
                        session: m.to.externalId,
                        date: formatTimeRange(m.to.startsAt, m.to.endsAt, locale),
                      })}
                    </span>
                  </ItemListRow>
                ))}
              </ItemList>
            )}
            {o.remaining > 0 && (
              <Alert tone="warning" role="none">
                {t('remaining', { count: o.remaining })}
              </Alert>
            )}
            {onMove && o.moves.length > 0 && (
              <div>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    onMove(o)
                  }}
                >
                  <ArrowRightLeft aria-hidden />
                  {t('apply', { count: o.moves.reduce((n, m) => n + m.count, 0) })}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  )
}
