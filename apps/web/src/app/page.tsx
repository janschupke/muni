import { getDashboard } from '@muni/db/repositories'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { StatCard } from '@muni/ui/stat-card'
import { formatDate, formatInteger, formatPercent } from '@muni/utils/format'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { ComplianceBar, ComplianceLegend } from '@/components/compliance-breakdown'
import { SessionTable } from '@/components/session-table'
import { getViewer } from '@/server/auth'

export default async function DashboardPage() {
  const [data, t, locale, viewer] = await Promise.all([
    getDashboard(),
    getTranslations('dashboard'),
    getLocale(),
    getViewer(),
  ])
  const held = data.counts.VALID + data.counts.EXPIRING

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description', { date: formatDate(data.asOf, locale) })}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label={t('kpi.activeEmployees')}
          value={formatInteger(data.activeEmployees, locale)}
          hint={t('kpi.activeHint', { count: data.parentalLeave })}
        />
        <StatCard
          label={t('kpi.complianceRate')}
          value={formatPercent(data.rate, locale)}
          hint={t('kpi.complianceHint', { held, total: data.counts.total })}
          tone="accent"
        />
        <StatCard
          label={t('kpi.expiring')}
          value={formatInteger(data.counts.EXPIRING, locale)}
          hint={t('kpi.expiringHint', { days: data.expiringWithinDays })}
          tone="warning"
        />
        <StatCard
          label={t('kpi.expired')}
          value={formatInteger(data.counts.EXPIRED, locale)}
          tone="danger"
        />
        <StatCard
          label={t('kpi.missing')}
          value={formatInteger(data.counts.MISSING, locale)}
          tone="danger"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader title={t('byDepartment.title')} description={t('byDepartment.description')} />
          <CardBody>
            <ComplianceLegend className="mb-4" />
            <ul className="flex flex-col gap-3">
              {data.byDepartment.map(d => (
                <li key={d.department}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <Link
                      href={`/employees?department=${encodeURIComponent(d.department)}`}
                      className="text-fg hover:underline"
                    >
                      {d.department}
                    </Link>
                    <span className="font-medium text-fg tabular-nums">
                      {formatPercent(d.rate, locale)}
                    </span>
                  </div>
                  <ComplianceBar counts={d.counts} label={d.department} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <div className="min-w-0 lg:col-span-3">
          <h2 className="mb-3 text-base font-semibold text-fg">{t('upcoming.title')}</h2>
          {data.upcomingSessions.length === 0 ? (
            <EmptyState title={t('upcoming.empty')} />
          ) : (
            <SessionTable
              sessions={data.upcomingSessions}
              canEdit={viewer === 'authenticated'}
              compact
            />
          )}
        </div>
      </div>
    </>
  )
}
