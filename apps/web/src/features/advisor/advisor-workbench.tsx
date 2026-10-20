'use client'

import {
  type AdvisorPlan,
  type BreakdownRow,
  type Bucket,
  forecastEnd,
  NOW,
  UPCOMING,
  upcomingRow,
} from '@muni/domain/advisor'
import { Badge } from '@muni/ui/badge'
import type { TablePaging } from '@muni/ui/data-table'
import { LinkTab, LinkTabs } from '@muni/ui/nav'
import { StatCard } from '@muni/ui/stat-card'
import { formatDate, formatInteger } from '@muni/utils/format'
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
 * Each count has a row in the breakdown that lists exactly those trainings. The plan is
 * computed on the server, which sends the view's table a page at a time (`plan.items` is that
 * page); booking and resolving re-check everything there.
 */
export function AdvisorWorkbench({
  plan,
  asOf,
  view,
  bucket,
  total,
  counts,
  paging,
  canApply,
}: {
  plan: AdvisorPlan
  asOf: string
  view: AdvisorView
  /** The breakdown's row: now, everything upcoming, or a month. */
  bucket: Bucket
  /** Trainings in the view's table, on every page. */
  total: number
  /** Trainings that need action, and that are booked: the tabs' counts. */
  counts: { action: number; planned: number }
  paging: TablePaging
  canApply: boolean
}) {
  const t = useTranslations('advisor')
  const locale = useLocale()
  const n = (value: number) => formatInteger(value, locale)

  const [nowRow, ...months] = plan.breakdown
  const upcoming = upcomingRow(months)
  const split = (row: BreakdownRow | undefined) => ({
    planned: n((row?.counts.PLANNED ?? 0) + (row?.counts.PLANNED_LATE ?? 0)),
    action: n(row?.counts.ACTION_REQUIRED ?? 0),
  })
  const end = formatDate(forecastEnd(asOf))

  const tabs: { view: AdvisorView; count?: number; tone?: 'danger' | 'neutral' }[] = [
    { view: 'breakdown' },
    {
      view: 'action',
      count: counts.action,
      tone: counts.action > 0 ? 'danger' : 'neutral',
    },
    { view: 'planned', count: counts.planned },
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
          hint={t('kpi.split', split(nowRow))}
          tone={plan.totals.now > 0 ? 'danger' : 'success'}
        />
        <StatCard
          href={advisorHref('breakdown', UPCOMING)}
          linkAs={Link}
          label={t('kpi.upcoming', { date: end })}
          value={n(plan.totals.upcoming)}
          hint={t('kpi.split', split(upcoming))}
          tone="warning"
        />
        <StatCard
          href={advisorHref('action')}
          linkAs={Link}
          label={t('kpi.action')}
          value={n(plan.totals.actionRequired)}
          hint={t('kpi.actionHint', {
            now: n(nowRow?.counts.ACTION_REQUIRED ?? 0),
            upcoming: n(upcoming.counts.ACTION_REQUIRED),
            proposed: n(plan.totals.proposed),
          })}
          tone={plan.totals.actionRequired > 0 ? 'danger' : 'success'}
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
        <LinkTabs aria-label={t('views.label')} className="mb-4">
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
            <BreakdownChart breakdown={plan.breakdown} selected={bucket} asOf={asOf} end={end} />
            {/* A new row is a new table: its sorting starts afresh. */}
            <BreakdownTable
              key={bucket}
              items={plan.items}
              total={total}
              paging={paging}
              bucket={bucket}
              asOf={asOf}
              canBook={canApply}
            />
          </div>
        )}
        {view === 'action' && (
          <ActionTable
            // A new page starts with nothing picked: what is booked is what is on screen.
            key={'server' in paging ? paging.server.page : 1}
            items={plan.items}
            total={total}
            paging={paging}
            shortfall={plan.shortfall}
            asOf={asOf}
            canBook={canApply}
          />
        )}
        {view === 'planned' && (
          <PlannedTable
            items={plan.items}
            total={total}
            paging={paging}
            asOf={asOf}
            canEdit={canApply}
          />
        )}
        {view === 'overbooked' && (
          <OverbookedList overbooked={plan.overbooked} canResolve={canApply} />
        )}
      </div>

      <AdvisorRules />
    </div>
  )
}
