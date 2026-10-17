'use client'

import type { RoomOption } from '@muni/db/repositories'
import {
  DEFAULT_SESSION_MINUTES,
  type OfferCourse,
  PLAN_HORIZON_DAYS,
  type PlannerGroup,
  type SessionOffer,
} from '@muni/domain/planner'
import { Alert } from '@muni/ui/alert'
import { Badge } from '@muni/ui/badge'
import { Button } from '@muni/ui/button'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { DetailGrid, DetailPanel } from '@muni/ui/detail-panel'
import { EmptyState } from '@muni/ui/empty-state'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
import { SectionHeading } from '@muni/ui/section-heading'
import { CellStack, Table, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import {
  formatDate,
  formatInteger,
  formatMonth,
  formatTimeRange,
  PLACEHOLDER,
} from '@muni/utils/format'
import { CalendarPlus, Clock, TriangleAlert } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { RoomLink } from '@/components/session-links'

// Loaded when needed: the review opens when an offer is chosen.
const OfferReview = dynamic(() => import('./offer-review').then(m => m.OfferReview))

const col = createDataColumns<SessionOffer>()

export function PlannerView({
  groups,
  paging,
  rooms,
  canCreate,
}: {
  groups: PlannerGroup[]
  /** Every course's table: sorted on the server, the courses paged below them. */
  paging: TablePaging
  rooms: readonly RoomOption[]
  canCreate: boolean
}) {
  const t = useTranslations('planner')
  const [reviewing, setReviewing] = useState<{ offer: SessionOffer; from: HTMLElement } | null>(
    null
  )
  return (
    <div className="flex flex-col gap-8">
      {!canCreate && (
        <Alert tone="info" variant="inline">
          {t('readOnly')}
        </Alert>
      )}
      {groups.map(group => (
        <section key={group.course.code} aria-labelledby={`course-${group.course.code}`}>
          <CourseHeading course={group.course} id={`course-${group.course.code}`} />
          <OfferTable
            group={group}
            paging={paging}
            canCreate={canCreate}
            onReview={(offer, from) => {
              setReviewing({ offer, from })
            }}
          />
        </section>
      ))}
      {reviewing && (
        <OfferReview
          key={reviewing.offer.id}
          open
          offer={reviewing.offer}
          rooms={rooms}
          onOpenChange={open => {
            if (!open) setReviewing(null)
          }}
          returnFocusTo={() => (reviewing.from.isConnected ? reviewing.from : null)}
        />
      )}
    </div>
  )
}

function CourseHeading({ course, id }: { course: OfferCourse; id: string }) {
  const t = useTranslations('planner')
  const tc = useTranslations('status.capability')
  const length = course.sessionMinutes ?? DEFAULT_SESSION_MINUTES
  const facts = [
    course.groupSize === null
      ? t('needsAny', { length })
      : t('needs', { length, size: course.groupSize }),
    ...(course.onlineAllowed ? [t('online')] : []),
    ...(course.capabilities.length > 0
      ? [t('capabilities', { list: course.capabilities.map(c => tc(c)).join(', ') })]
      : []),
  ]
  return (
    <SectionHeading id={id} className="mt-0" description={facts.join(' · ')}>
      <TextLink asChild>
        <Link href={`/courses/${course.code}`}>{course.name}</Link>
      </TextLink>
    </SectionHeading>
  )
}

function OfferTable({
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
  const locale = useLocale()
  const columns = useMemo(
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
                <span className="font-medium">{formatTimeRange(slot.startsAt, slot.endsAt)}</span>
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
                header: () => <span className="sr-only">{t('columns.action')}</span>,
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

function ProblemText({ offer }: { offer: SessionOffer }) {
  const t = useTranslations('planner.problems')
  const tc = useTranslations('status.capability')
  const problem = offer.problem ?? { kind: 'NO_FREE_SLOT' }
  let text: string
  switch (problem.kind) {
    case 'NO_ROOM_WITH':
      text = t('NO_ROOM_WITH', { missing: problem.missing.map(c => tc(c)).join(', ') })
      break
    case 'NO_ROOM_LARGE_ENOUGH':
      text = t('NO_ROOM_LARGE_ENOUGH', { size: offer.size, largest: problem.largest })
      break
    case 'NO_FREE_SLOT':
      text = t('NO_FREE_SLOT', { days: PLAN_HORIZON_DAYS })
      break
    default:
      text = t(problem.kind)
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-danger-fg">
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      {text}
    </span>
  )
}

/** An opened offer: the people it is for, and the other rooms free at its slot. */
function OfferDetails({ offer }: { offer: SessionOffer }) {
  const t = useTranslations('planner.expanded')
  const tr = useTranslations('planner.review')
  return (
    <DetailGrid layout="wide-narrow">
      <DetailPanel title={t('people')} count={offer.people.length} level={3} flush>
        <Table
          density="compact"
          paging="the people one session takes: bounded by its seats"
          aria-label={t('people')}
        >
          <THead>
            <tr>
              <Th>{t('person')}</Th>
              <Th>{t('department')}</Th>
              <Th>{t('lapses')}</Th>
            </tr>
          </THead>
          <TBody>
            {offer.people.map(p => (
              <Tr key={p.externalId}>
                <Td>
                  <TextLink asChild>
                    <Link href={`/employees/${p.externalId}`}>{p.name}</Link>
                  </TextLink>
                </Td>
                <Td>{p.department ?? PLACEHOLDER}</Td>
                <Td nowrap>{p.lapses ? formatDate(p.lapses) : tr('neverHeld')}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </DetailPanel>
      <DetailPanel title={t('rooms')} count={offer.alternatives.length} level={3}>
        {offer.alternatives.length === 0 ? (
          <EmptyState variant="inline" title={t('noRooms')} />
        ) : (
          <ItemList>
            {offer.alternatives.map(r => (
              <ItemListRow key={r.id}>
                <RoomLink room={r} />
              </ItemListRow>
            ))}
          </ItemList>
        )}
      </DetailPanel>
    </DetailGrid>
  )
}
