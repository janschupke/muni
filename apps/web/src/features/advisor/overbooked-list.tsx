'use client'

import type { OverbookedSession } from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { BarRow } from '@muni/ui/bar-row'
import { Button } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { EmptyState } from '@muni/ui/empty-state'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
import { Meter } from '@muni/ui/meter'
import { TextLink } from '@muni/ui/text-link'
import { ArrowRightLeft } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { RoomLink, SessionDateLink } from '@/components/session-links'

/** Sessions over capacity, with the seat moves that bring them back under it. */
export function OverbookedList({
  overbooked,
  onMove,
  pending,
}: {
  overbooked: OverbookedSession[]
  /** Signed-in only: applies all moves proposed for one session. */
  onMove?: ((item: OverbookedSession) => void) | undefined
  pending: boolean
}) {
  const t = useTranslations('advisor.overbooked')
  if (overbooked.length === 0) return <EmptyState title={t('none')} />
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {overbooked.map(o => (
        <Card key={o.session.externalId}>
          <CardHeader
            title={
              <TextLink asChild>
                <Link
                  href={`/courses/${o.session.courseCode}`}
                  className="inline-flex min-h-6 items-center"
                >
                  {o.session.courseName}
                </Link>
              </TextLink>
            }
            description={
              <>
                <SessionDateLink session={o.session} />
                {' · '}
                <RoomLink room={o.session.room} />
              </>
            }
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
                      {t('moveTo', { count: m.count })} <SessionDateLink session={m.to} />
                      {' · '}
                      <RoomLink room={m.to.room} />
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
