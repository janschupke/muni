'use client'

import { type PlannerGroup, type SessionOffer } from '@muni/domain/planner'
import { Badge } from '@muni/ui/badge'
import { Button } from '@muni/ui/button'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { formatDate, formatInteger, formatMonth, formatSessionTime } from '@muni/utils/format'
import { CalendarPlus, Clock } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { hiddenHeader } from '@/components/table/table-columns'
import { RoomLink } from '@/features/sessions/session-links'

import { OfferDetails } from './offer-details'
import { ProblemText } from './problem-text'

const col = createDataColumns<SessionOffer>()

/**
 * The planner table's columns: when the group is due, the slot (or why there is none), the
 * room (with the others free then), the people and seats, and for admins the way to review it.
 */
function useOfferColumns({
  group,
  canCreate,
  onReview,
}: {
  group: PlannerGroup
  canCreate: boolean
  onReview: (offer: SessionOffer, from: HTMLElement) => void
}) {
  const t = useTranslations('planner')
  const locale = useLocale()
  return useMemo(
    () =>
      col.columns([
        col.accessor('deadline', {
          id: 'due',
          header: t('columns.due'),
          sortFn: 'text',
          meta: { nowrap: true },
          cell: ({ row }) => (
            <CellStack
              title={formatDate(row.original.deadline)}
              meta={
                row.original.bucket === 'now'
                  ? t('bucket.now')
                  : t('bucket.month', { month: formatMonth(row.original.bucket, locale) })
              }
            />
          ),
        }),
        col.accessor(o => o.slot?.startsAt, {
          id: 'slot',
          header: t('columns.slot'),
          sortFn: 'text',
          meta: { nowrap: true },
          cell: ({ row }) => {
            const { slot, late, problem } = row.original
            if (!slot || problem) return <ProblemText offer={row.original} />
            return (
              <div className="flex flex-col items-start gap-1">
                <span className="font-medium">{formatSessionTime(slot)}</span>
                {late && (
                  <Badge tone="warning">
                    <Clock aria-hidden />
                    {t('late')}
                  </Badge>
                )}
              </div>
            )
          },
        }),
        col.display({
          id: 'room',
          header: t('columns.room'),
          cell: ({ row }) =>
            row.original.room ? (
              <CellStack
                title={<RoomLink room={row.original.room} />}
                meta={
                  row.original.alternatives.length > 0
                    ? t('otherRooms', {
                        rooms: row.original.alternatives.map(r => r.name).join(', '),
                      })
                    : undefined
                }
              />
            ) : null,
        }),
        col.accessor('size', {
          id: 'seats',
          header: t('columns.seats'),
          sortFn: 'basic',
          meta: { align: 'right', nowrap: true },
          cell: ({ row }) =>
            row.original.capacity === null
              ? formatInteger(row.original.size, locale)
              : `${formatInteger(row.original.size, locale)} · ${formatInteger(row.original.capacity, locale)}`,
        }),
        ...(canCreate
          ? [
              col.display({
                id: 'action',
                // Named for screen readers; the buttons say what they do.
                header: hiddenHeader(t('columns.action')),
                cell: ({ row }) => {
                  const offer = row.original
                  if (!offer.slot || !offer.room || offer.capacity === null) return null
                  return (
                    <Button
                      size="sm"
                      aria-label={t('review.openLabel', {
                        course: offer.course.name,
                        n: group.offers.indexOf(offer) + 1,
                      })}
                      onClick={event => {
                        onReview(offer, event.currentTarget)
                      }}
                    >
                      <CalendarPlus aria-hidden />
                      {t('review.open')}
                    </Button>
                  )
                },
              }),
            ]
          : []),
      ]),
    [canCreate, group.offers, locale, onReview, t]
  )
}

export function OfferTable({
  group,
  paging,
  canCreate,
  onReview,
}: {
  group: PlannerGroup
  paging: TablePaging
  canCreate: boolean
  onReview: (offer: SessionOffer, from: HTMLElement) => void
}) {
  const t = useTranslations('planner')
  const columns = useOfferColumns({ group, canCreate, onReview })
  return (
    <DataTable
      caption={group.course.name}
      columns={columns}
      data={group.offers}
      getRowId={o => o.id}
      paging={paging}
      renderExpanded={o => <OfferDetails offer={o} />}
      expandLabel={o => t('toggle', { course: o.course.name, n: group.offers.indexOf(o) + 1 })}
      expandHeader={t('panelHeader')}
    />
  )
}
