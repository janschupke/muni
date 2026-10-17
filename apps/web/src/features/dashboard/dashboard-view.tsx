'use client'

import { Alert } from '@muni/ui/alert'
import { BarRow } from '@muni/ui/bar-row'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { SectionHeading } from '@muni/ui/section-heading'
import { StatCard } from '@muni/ui/stat-card'
import { TextLink } from '@muni/ui/text-link'
import { formatDate, formatInteger, formatPercent } from '@muni/utils/format'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { ComplianceBar, ComplianceLegend } from '@/components/compliance-breakdown'
import { ReadView } from '@/components/read-view'
import { SessionTable } from '@/components/session-table'
import { DashboardSkeleton } from '@/components/skeletons'
import { rateTone } from '@/components/status-badges'
import { readQuery } from '@/lib/query/queries'
import type { ReadOutput } from '@/server/reads/registry'

/** The overview: compliance at a glance, what the advisor has waiting, the next sessions. */
export function DashboardView({ canEdit }: { canEdit: boolean }) {
  const read = useQuery(readQuery('dashboard', {}))
  return (
    <ReadView query={read} skeleton={<DashboardSkeleton />}>
      {data => <Dashboard {...data} canEdit={canEdit} />}
    </ReadView>
  )
}

function Dashboard({ data, advisor, canEdit }: ReadOutput<'dashboard'> & { canEdit: boolean }) {
  const t = useTranslations('dashboard')
  const locale = useLocale()
  const held = data.counts.VALID + data.counts.EXPIRING
  const { now, action, overbooked } = advisor
  const count = (n: number) => formatInteger(n, locale)
  const employees = (compliance?: string) =>
    `/employees?status=ACTIVE${compliance ? `&compliance=${compliance}` : ''}`

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description', { date: formatDate(data.asOf, locale) })}
      />

      {(now > 0 || overbooked > 0) && (
        <Alert tone={action > 0 || overbooked > 0 ? 'warning' : 'info'} className="mb-4">
          {t('advisor.summary', { now, action, overbooked })}{' '}
          <TextLink asChild emphasis tone="inherit" arrow>
            <Link href="/advisor">{t('advisor.open')}</Link>
          </TextLink>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          href={employees()}
          linkAs={Link}
          label={t('kpi.activeEmployees')}
          value={count(data.activeEmployees)}
          hint={t('kpi.activeHint', { count: data.parentalLeave })}
        />
        <StatCard
          href="/compliance"
          linkAs={Link}
          label={t('kpi.complianceRate')}
          value={formatPercent(data.rate, locale)}
          hint={t('kpi.complianceHint', { held, total: data.counts.total })}
          tone={rateTone(data.rate)}
        />
        <StatCard
          href={employees('EXPIRING')}
          linkAs={Link}
          label={t('kpi.expiring')}
          value={count(data.counts.EXPIRING)}
          hint={t('kpi.expiringPeople', {
            people: data.people.EXPIRING,
            days: data.expiringWithinDays,
          })}
          tone="warning"
        />
        <StatCard
          href={employees('EXPIRED')}
          linkAs={Link}
          label={t('kpi.expired')}
          value={count(data.counts.EXPIRED)}
          hint={t('kpi.trainingsPeople', { people: data.people.EXPIRED })}
          tone="serious"
        />
        <StatCard
          href={employees('MISSING')}
          linkAs={Link}
          label={t('kpi.missing')}
          value={count(data.counts.MISSING)}
          hint={t('kpi.trainingsPeople', { people: data.people.MISSING })}
          tone="danger"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader title={t('byDepartment.title')} description={t('byDepartment.description')} />
          <CardBody>
            {data.byDepartment.length === 0 ? (
              <EmptyState variant="inline" title={t('byDepartment.empty')} />
            ) : (
              <>
                <ComplianceLegend className="mb-4" />
                <ul className="flex flex-col gap-3">
                  {data.byDepartment.map(d => (
                    <li key={d.id}>
                      <BarRow
                        label={
                          <TextLink asChild>
                            <Link href={`/departments/${d.id}`}>{d.department}</Link>
                          </TextLink>
                        }
                        value={formatPercent(d.rate, locale)}
                        bar={<ComplianceBar counts={d.counts} label={d.department} />}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardBody>
        </Card>

        <div className="min-w-0 lg:col-span-3">
          <SectionHeading className="mt-0">{t('upcoming.title')}</SectionHeading>
          {data.upcomingSessions.length === 0 ? (
            <EmptyState title={t('upcoming.empty')} />
          ) : (
            <SessionTable
              sessions={data.upcomingSessions}
              canEdit={canEdit}
              compact
              caption={t('upcoming.title')}
            />
          )}
        </div>
      </div>
    </>
  )
}
