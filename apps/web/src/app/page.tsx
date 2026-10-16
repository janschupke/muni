import { getAdvisorInput, getDashboard } from '@muni/db/repositories'
import { planAssignments } from '@muni/domain/advisor'
import { canWrite } from '@muni/domain/enums'
import { Alert } from '@muni/ui/alert'
import { BarRow } from '@muni/ui/bar-row'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { SectionHeading } from '@muni/ui/section-heading'
import { StatCard } from '@muni/ui/stat-card'
import { TextLink } from '@muni/ui/text-link'
import { formatDate, formatInteger, formatPercent } from '@muni/utils/format'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { ComplianceBar, ComplianceLegend } from '@/components/compliance-breakdown'
import { SessionTable } from '@/components/session-table'
import { rateTone } from '@/components/status-badges'
import { ArchivedAccount } from '@/features/landing/archived-account'
import { Landing } from '@/features/landing/landing'
import { getSessionUser, isAccountArchived } from '@/server/auth'

/** Visitors get the introduction; signed-in users the dashboard. */
export default async function HomePage() {
  const user = await getSessionUser()
  if (!user) return (await isAccountArchived()) ? <ArchivedAccount /> : <Landing />
  const [data, advisorInput, t, locale] = await Promise.all([
    getDashboard(),
    getAdvisorInput(),
    getTranslations('dashboard'),
    getLocale(),
  ])
  const held = data.counts.VALID + data.counts.EXPIRING
  const plan = planAssignments(advisorInput)
  const now = plan.totals.now
  const action = plan.breakdown[0]?.counts.ACTION_REQUIRED ?? 0
  const overbooked = plan.overbooked.length
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
          <TextLink asChild emphasis tone="inherit">
            <Link href="/advisor" className="inline-flex items-center gap-1">
              {t('advisor.open')}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
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
            <ComplianceLegend className="mb-4" />
            <ul className="flex flex-col gap-3">
              {data.byDepartment.map(d => (
                <li key={d.department}>
                  <BarRow
                    label={
                      <TextLink asChild>
                        <Link href={`/employees?department=${encodeURIComponent(d.department)}`}>
                          {d.department}
                        </Link>
                      </TextLink>
                    }
                    value={formatPercent(d.rate, locale)}
                    bar={<ComplianceBar counts={d.counts} label={d.department} />}
                  />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <div className="min-w-0 lg:col-span-3">
          <SectionHeading className="mt-0">{t('upcoming.title')}</SectionHeading>
          {data.upcomingSessions.length === 0 ? (
            <EmptyState title={t('upcoming.empty')} />
          ) : (
            <SessionTable sessions={data.upcomingSessions} canEdit={canWrite(user.role)} compact />
          )}
        </div>
      </div>
    </>
  )
}
