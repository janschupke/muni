'use client'

import type { ProviderDetail } from '@muni/db/repositories'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatCurrency, formatInteger } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { actionsColumn } from '@/components/table/table-columns'
import { ScheduleSessionButton } from '@/features/sessions/schedule-button'

type OfferingRow = ProviderDetail['offerings'][number]

const offered = createDataColumns<OfferingRow>()

/**
 * The courses a provider offers: each at its price, with its sessions planned with it; for
 * admins, the way to schedule another with this provider (`ScheduleSessionButton`).
 */
export function ProviderOfferingsTable({
  providerId,
  providerName,
  rows,
  canEdit,
}: {
  providerId: string
  providerName: string
  rows: OfferingRow[]
  canEdit: boolean
}) {
  const t = useTranslations('providers.detail.offerings')
  const ts = useTranslations('sessions.schedule')
  const locale = useLocale()
  const columns = useMemo(
    () =>
      offered.columns([
        offered.accessor('name', {
          id: 'course',
          header: t('course'),
          cell: ({ row }) => (
            <CellStack
              title={
                <TextLink asChild emphasis>
                  <Link href={`/courses/${row.original.code}`}>{row.original.name}</Link>
                </TextLink>
              }
              meta={row.original.code}
            />
          ),
        }),
        offered.accessor('price', {
          id: 'price',
          header: t('price'),
          meta: { align: 'right', nowrap: true },
          cell: ({ getValue }) => formatCurrency(getValue()),
        }),
        offered.accessor('upcomingSessions', {
          id: 'upcoming',
          header: t('upcoming'),
          meta: { align: 'right' },
          cell: ({ getValue }) => formatInteger(getValue(), locale),
        }),
        ...(canEdit
          ? [
              actionsColumn(offered, ts('action'), o => (
                <ScheduleSessionButton
                  course={o.code}
                  provider={providerId}
                  label={t('scheduleWith', { course: o.name, provider: providerName })}
                  block={o.sessionMinutes === null ? 'NO_LENGTH' : null}
                />
              )),
            ]
          : []),
      ]),
    [t, ts, locale, canEdit, providerId, providerName]
  )
  return (
    <DataTable
      caption={t('caption', { name: providerName })}
      columns={columns}
      data={rows}
      getRowId={o => o.courseId}
      paging={{ local: 'the courses one provider offers: bounded by the catalogue' }}
    />
  )
}
