'use client'

import { type AdvisorPlan, type BreakdownRow, type Bucket, NOW } from '@muni/domain/advisor'
import { Badge } from '@muni/ui/badge'
import { LinkTab, LinkTabs } from '@muni/ui/nav'
import { StatCard } from '@muni/ui/stat-card'
import { formatInteger } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { ActionTable } from './action-table'
import { BreakdownChart } from './breakdown-chart'
import { BreakdownTable } from './breakdown-table'
import { advisorHref, type AdvisorView, VIEW_ICON } from './labels'
import { OverbookedList } from './overbooked-list'
import { PlannedTable } from './planned-table'
import { AdvisorRules } from './rules'

/**
 * The advisor: counts that link to their view, the view itself (breakdown by month, the
 * trainings that need action, the ones already booked, overbooked sessions) and the rule.
 * The plan is computed on the server; booking and resolving re-check everything there.
 */
export function AdvisorWorkbench({
  plan,
  asOf,
  view,
  bucket,
  canApply,
}: {
  plan: AdvisorPlan
  asOf: string
  view: AdvisorView
  bucket: Bucket
  canApply: boolean
}) {
  const t = useTranslations('advisor')
  const locale = useLocale()
  const n = (value: number) => formatInteger(value, locale)

  const [nowRow, ...months] = plan.breakdown
  const split = (rows: BreakdownRow[]) => ({
    planned: rows.reduce((total, r) => total + r.counts.PLANNED + r.counts.PLANNED_LATE, 0),
    action: rows.reduce((total, r) => total + r.counts.ACTION_REQUIRED, 0),
  })
  const firstMonth = months.find(r => r.total > 0)?.bucket
  const actionItems = plan.items.filter(i => i.remediation === 'ACTION_REQUIRED')
  const plannedItems = plan.items.filter(i => i.remediation !== 'ACTION_REQUIRED')

  const tabs: { view: AdvisorView; count?: number; tone?: 'danger' | 'neutral' }[] = [
    { view: 'breakdown' },
    {
      view: 'action',
      count: actionItems.length,
      tone: actionItems.length > 0 ? 'danger' : 'neutral',
    },
    { view: 'planned', count: plannedItems.length },
    {
      view: 'overbooked',
      count: plan.overbooked.length,
      tone: plan.overbooked.length > 0 ? 'danger' : 'neutral',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          href={advisorHref('breakdown', NOW)}
          linkAs={Link}
          label={t('kpi.now')}
          value={n(plan.totals.now)}
          hint={t('kpi.split', split(nowRow ? [nowRow] : []))}
          tone={plan.totals.now > 0 ? 'danger' : 'success'}
        />
        <StatCard
          href={advisorHref('breakdown', firstMonth ?? NOW)}
          linkAs={Link}
          label={t('kpi.upcoming', { months: months.length })}
          value={n(plan.totals.upcoming)}
          hint={t('kpi.split', split(months))}
          tone="warning"
        />
        <StatCard
          href={advisorHref('action')}
          linkAs={Link}
          label={t('kpi.action')}
          value={n(plan.totals.actionRequired)}
          hint={t('kpi.actionHint', { proposed: plan.totals.proposed })}
          tone="serious"
        />
        <StatCard
          href={advisorHref('overbooked')}
          linkAs={Link}
          label={t('kpi.overbooked')}
          value={n(plan.overbooked.length)}
          hint={t('kpi.overbookedHint', { count: plan.overbooked.length })}
          tone={plan.overbooked.length > 0 ? 'danger' : 'success'}
        />
      </div>

      <div>
        <LinkTabs aria-label={t('views.label')}>
          {tabs.map(tab => {
            const Icon = VIEW_ICON[tab.view]
            return (
              <LinkTab key={tab.view} asChild active={view === tab.view}>
                <Link href={advisorHref(tab.view)}>
                  <Icon aria-hidden />
                  {t(`views.${tab.view}`)}
                  {tab.count !== undefined && <Badge tone={tab.tone}>{n(tab.count)}</Badge>}
                </Link>
              </LinkTab>
            )
          })}
        </LinkTabs>

        {view === 'breakdown' && (
          <div className="flex flex-col gap-6">
            <BreakdownChart breakdown={plan.breakdown} selected={bucket} />
            <BreakdownTable
              items={plan.items.filter(i => i.bucket === bucket)}
              bucket={bucket}
              asOf={asOf}
            />
          </div>
        )}
        {view === 'action' && (
          <ActionTable
            items={actionItems}
            shortfall={plan.shortfall}
            asOf={asOf}
            canBook={canApply}
          />
        )}
        {view === 'planned' && <PlannedTable items={plannedItems} asOf={asOf} canEdit={canApply} />}
        {view === 'overbooked' && (
          <OverbookedList overbooked={plan.overbooked} canResolve={canApply} />
        )}
      </div>

      <AdvisorRules />
    </div>
  )
}
