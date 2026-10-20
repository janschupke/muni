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
import { formatSessionTime } from '@muni/utils/format'
import { ArrowRightLeft } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { RoomLink, SessionDateLink } from '@/components/session-links'

// Loaded when needed: the dialog opens when a session is chosen.
const ResolveDialog = dynamic(() => import('./resolve-dialog').then(m => m.ResolveDialog))

/**
 * Sessions over capacity, with the advisor's suggestion. An admin resolves each one in a
 * dialog: moving seats where they choose, or raising the capacity.
 */
export function OverbookedList({
  overbooked,
  canResolve,
}: {
  overbooked: OverbookedSession[]
  /** Admins only. */
  canResolve: boolean
}) {
  const t = useTranslations('advisor.overbooked')
  const [resolving, setResolving] = useState<{ item: OverbookedSession; from: HTMLElement } | null>(
    null
  )
  if (overbooked.length === 0) return <EmptyState title={t('none')} />
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {overbooked.map(o => (
        <Card key={o.session.externalId}>
          <CardHeader
            title={
              <TextLink asChild hitArea>
                <Link href={`/courses/${o.session.courseCode}`}>{o.session.courseName}</Link>
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
                    <div className="flex flex-col">
                      <span>{t('moveTo', { count: m.count })}</span>
                      <span>
                        <SessionDateLink session={m.to} />
                        {' · '}
                        <RoomLink room={m.to.room} />
                      </span>
                    </div>
                  </ItemListRow>
                ))}
              </ItemList>
            )}
            {o.remaining > 0 && (
              <Alert tone="warning" role="none">
                {t('remaining', { count: o.remaining })}
              </Alert>
            )}
            {canResolve && (
              <div>
                <Button
                  size="sm"
                  aria-label={t('resolveLabel', {
                    course: o.session.courseName,
                    date: formatSessionTime(o.session),
                  })}
                  onClick={event => {
                    setResolving({ item: o, from: event.currentTarget })
                  }}
                >
                  <ArrowRightLeft aria-hidden />
                  {t('resolve')}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      ))}
      {resolving && (
        <ResolveDialog
          key={resolving.item.session.externalId}
          open
          overbooked={resolving.item}
          onOpenChange={open => {
            if (!open) setResolving(null)
          }}
          returnFocusTo={() => resolving.from}
        />
      )}
    </div>
  )
}
