'use client'

import {
  DEFAULT_SESSION_MINUTES,
  type OfferCourse,
  PLAN_HORIZON_DAYS,
  type SessionOffer,
} from '@muni/domain/planner'
import { Alert } from '@muni/ui/alert'
import { Badge } from '@muni/ui/badge'
import { Button } from '@muni/ui/button'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { IconButton } from '@muni/ui/icon-button'
import { SectionHeading } from '@muni/ui/section-heading'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatDate, formatInteger, formatMonth, formatTimeRange } from '@muni/utils/format'
import { ArrowRight, CalendarPlus, Clock, TriangleAlert, X } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { RoomLink } from '@/components/session-links'
import { createOfferedSession, type CreateOutcome } from '@/server/actions/sessions'

export interface PlannerGroup {
  course: OfferCourse
  offers: SessionOffer[]
}

const col = createDataColumns<SessionOffer>()

export function PlannerView({ groups, canCreate }: { groups: PlannerGroup[]; canCreate: boolean }) {
  const t = useTranslations('planner')
  const [result, setResult] = useState<CreateOutcome | null>(null)
  return (
    <div className="flex flex-col gap-8">
      {!canCreate && (
        <Alert tone="info" variant="inline">
          {t('readOnly')}
        </Alert>
      )}
      {groups.map(group => (
        <section key={group.course.code} aria-label={group.course.name}>
          <CourseHeading course={group.course} />
          <OfferTable group={group} canCreate={canCreate} onResult={setResult} />
        </section>
      ))}
      {result && (
        <ResultPanel
          result={result}
          onClose={() => {
            setResult(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * What creating a session did. Created, the offer leaves the refreshed plan (often its whole
 * course with it), so the result stays in view at the screen's foot, focused, until closed.
 */
function ResultPanel({ result, onClose }: { result: CreateOutcome; onClose: () => void }) {
  const t = useTranslations('planner')
  const tc = useTranslations('common')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [result])
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="fixed inset-x-4 bottom-4 z-40 flex items-start gap-2 rounded-md bg-surface-overlay shadow-overlay outline-none sm:left-auto sm:w-[28rem]"
    >
      {result.ok ? (
        <Alert tone="success" className="flex-1">
          {t('created', { id: result.externalId })}{' '}
          <TextLink asChild tone="inherit">
            <Link href={`/sessions/${result.externalId}`}>{t('openSession')}</Link>
          </TextLink>{' '}
          ·{' '}
          <TextLink asChild tone="inherit">
            <Link href="/advisor?view=action" className="inline-flex items-center gap-1">
              {t('bookInAdvisor')}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </TextLink>
        </Alert>
      ) : (
        <Alert tone="danger" className="flex-1">
          {t(`refused.${result.reason}`)}
        </Alert>
      )}
      <IconButton label={tc('close')} onClick={onClose} className="mt-1 mr-1">
        <X aria-hidden />
      </IconButton>
    </div>
  )
}

function CourseHeading({ course }: { course: OfferCourse }) {
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
    <SectionHeading className="mt-0" description={facts.join(' · ')}>
      <TextLink asChild>
        <Link href={`/courses/${course.code}`}>{course.name}</Link>
      </TextLink>
    </SectionHeading>
  )
}

function OfferTable({
  group,
  canCreate,
  onResult,
}: {
  group: PlannerGroup
  canCreate: boolean
  onResult: (result: CreateOutcome) => void
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
              title={formatDate(row.original.deadline, locale)}
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
                <span className="font-medium">
                  {formatTimeRange(slot.startsAt, slot.endsAt, locale)}
                </span>
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
                    ? t('alternatives', { count: row.original.alternatives.length })
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
                header: t('columns.action'),
                meta: { headerClassName: 'sr-only' },
                cell: ({ row }) => <CreateButton offer={row.original} onResult={onResult} />,
              }),
            ]
          : []),
      ]),
    [canCreate, locale, onResult, t]
  )
  return (
    <DataTable
      caption={group.course.name}
      columns={columns}
      data={group.offers}
      getRowId={o => o.id}
      renderExpanded={o => <PeopleList offer={o} />}
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

function PeopleList({ offer }: { offer: SessionOffer }) {
  const locale = useLocale()
  return (
    <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 xl:grid-cols-3">
      {offer.people.map(p => (
        <li key={p.externalId} className="flex items-baseline justify-between gap-3">
          <TextLink asChild>
            <Link href={`/employees/${p.externalId}`}>{p.name}</Link>
          </TextLink>
          <span className="text-xs text-fg-muted">
            {[p.department, p.lapses && formatDate(p.lapses, locale)].filter(Boolean).join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  )
}

function CreateButton({
  offer,
  onResult,
}: {
  offer: SessionOffer
  onResult: (result: CreateOutcome) => void
}) {
  const t = useTranslations('planner')
  const [pending, startTransition] = useTransition()
  const { slot, room, capacity } = offer
  if (!slot || !room || capacity === null) return null
  return (
    <Button
      size="sm"
      variant="primary"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const outcome = await createOfferedSession({
            courseId: offer.course.id,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            roomId: room.id,
            capacity,
            pricePerPerson: null,
            status: 'PLANNED',
          })
          // The action revalidates: a created session leaves the refreshed plan by itself.
          onResult(outcome)
        })
      }}
    >
      <CalendarPlus aria-hidden />
      {pending ? t('creating') : t('create')}
    </Button>
  )
}
