'use client'

import type { PlanItem } from '@muni/domain/advisor'
import type { RoomRef } from '@muni/domain/rooms'
import { createDataColumns } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { RoomLink, SessionDateLink } from '@/components/session-links'
import { ComplianceBadge } from '@/components/status-badges'

import { LapsesText, WindowText } from './labels'

export const col = createDataColumns<PlanItem>()

export const itemId = (i: PlanItem) => `${i.need.employee.externalId}|${i.need.course.code}`

/** The columns every advisor table shares: who, which training, when it lapses, the gap. */
export function usePlanColumns(asOf: string) {
  const t = useTranslations('advisor.columns')
  return useMemo(
    () => ({
      person: col.accessor(i => i.need.employee.name, {
        id: 'person',
        header: t('person'),
        sortFn: 'text',
        cell: ({ row }) => (
          <CellStack
            title={
              <TextLink asChild emphasis>
                <Link href={`/employees/${row.original.need.employee.externalId}`}>
                  {row.original.need.employee.name}
                </Link>
              </TextLink>
            }
            meta={row.original.need.employee.department ?? PLACEHOLDER}
          />
        ),
      }),
      training: col.accessor(i => i.need.course.name, {
        id: 'training',
        header: t('training'),
        sortFn: 'text',
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <TextLink asChild>
              <Link href={`/courses/${row.original.need.course.code}`}>
                {row.original.need.course.name}
              </Link>
            </TextLink>
            <ComplianceBadge status={row.original.need.status} />
          </div>
        ),
      }),
      lapses: col.accessor(i => i.lapses ?? undefined, {
        id: 'lapses',
        header: t('lapses'),
        sortFn: 'basic',
        meta: { nowrap: true },
        cell: ({ row }) => <LapsesText lapses={row.original.lapses} asOf={asOf} />,
      }),
      window: col.accessor(i => i.window?.days ?? undefined, {
        id: 'window',
        header: t('window'),
        sortFn: 'basic',
        cell: ({ row }) => <WindowText window={row.original.window} />,
      }),
    }),
    [asOf, t]
  )
}

/** A session as "date (link) / room (link)". */
export function SessionCell({
  session,
}: {
  session: { externalId: string; startsAt: string; endsAt: string; room: RoomRef }
}) {
  return (
    <CellStack
      title={<SessionDateLink session={session} emphasis />}
      meta={<RoomLink room={session.room} />}
    />
  )
}

export function usePaginationLabels() {
  const t = useTranslations('advisor.table')
  return {
    nav: t('pagination'),
    previous: t('previous'),
    next: t('next'),
    status: (page: number, pageCount: number) => t('page', { page, pageCount }),
  }
}
