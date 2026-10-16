'use client'

import {
  NOW,
  type AdvisorPlan,
  type BreakdownRow,
  type Bucket,
  type OverbookedSession,
} from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { Badge } from '@muni/ui/badge'
import { LinkTab, LinkTabs } from '@muni/ui/nav'
import { StatCard } from '@muni/ui/stat-card'
import { toZonedParts } from '@muni/utils/dates'
import { formatDate, formatInteger } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import {
  applyAssignmentsAction,
  moveSeatsAction,
  type ApplyResult,
} from '@/server/actions/assignments'

import { ActionTable, type ProposedItem } from './action-table'
import { BreakdownChart } from './breakdown-chart'
import { BreakdownTable } from './breakdown-table'
import { advisorHref, type AdvisorView } from './labels'
import { OverbookedList } from './overbooked-list'
import { PlannedTable } from './planned-table'
import { AdvisorRules } from './rules'

type Outcome =
  | {
      kind: 'applied'
      result: ApplyResult
      names: Map<string, string>
      sessions: Map<string, string>
    }
  | { kind: 'moved'; moved: number; failed: number }
  | { kind: 'error' }

/**
 * The advisor: counts that link to their view, the view itself (breakdown by month, the
 * trainings that need action, the ones already booked, overbooked sessions) and the rule.
 * The plan is computed on the server; saving re-checks every pair there and re-renders.
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
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const n = (value: number) => formatInteger(value, locale)

  const save = (items: ProposedItem[]) => {
    startTransition(async () => {
      try {
        const result = await applyAssignmentsAction(
          items.map(i => ({
            sessionExternalId: i.proposal.session.externalId,
            employeeExternalId: i.need.employee.externalId,
            source: 'ADVISOR' as const,
          }))
        )
        const names = new Map(items.map(i => [i.need.employee.externalId, i.need.employee.name]))
        const sessions = new Map(
          items.map(({ proposal: { session: s } }) => [
            s.externalId,
            `${s.courseName} (${formatDate(toZonedParts(s.startsAt).date, locale)})`,
          ])
        )
        setOutcome({ kind: 'applied', result, names, sessions })
      } catch {
        setOutcome({ kind: 'error' })
      }
    })
  }

  const move = (item: OverbookedSession) => {
    startTransition(async () => {
      try {
        let moved = 0
        let failed = 0
        for (const m of item.moves) {
          const result = await moveSeatsAction({
            from: item.session.externalId,
            to: m.to.externalId,
            count: m.count,
          })
          if (result.ok) moved += m.count
          else failed += m.count
        }
        setOutcome({ kind: 'moved', moved, failed })
      } catch {
        setOutcome({ kind: 'error' })
      }
    })
  }

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
          tone="danger"
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

      {outcome && <OutcomeAlert outcome={outcome} />}

      <div>
        <LinkTabs aria-label={t('views.label')}>
          {tabs.map(tab => (
            <LinkTab key={tab.view} asChild active={view === tab.view}>
              <Link href={advisorHref(tab.view)}>
                {t(`views.${tab.view}`)}
                {tab.count !== undefined && <Badge tone={tab.tone}>{n(tab.count)}</Badge>}
              </Link>
            </LinkTab>
          ))}
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
            cost={plan.cost}
            asOf={asOf}
            onSave={canApply ? save : undefined}
            pending={pending}
          />
        )}
        {view === 'planned' && <PlannedTable items={plannedItems} asOf={asOf} canEdit={canApply} />}
        {view === 'overbooked' && (
          <OverbookedList
            overbooked={plan.overbooked}
            onMove={canApply ? move : undefined}
            pending={pending}
          />
        )}
      </div>

      <AdvisorRules />
    </div>
  )
}

function OutcomeAlert({ outcome }: { outcome: Outcome }) {
  const t = useTranslations('advisor.outcome')
  if (outcome.kind === 'error') return <Alert tone="danger">{t('error')}</Alert>
  if (outcome.kind === 'moved') {
    return (
      <Alert tone={outcome.failed > 0 ? 'warning' : 'success'}>
        {t('moved', { moved: outcome.moved, failed: outcome.failed })}
      </Alert>
    )
  }
  const { result, names, sessions } = outcome
  return (
    <Alert
      tone={result.failed.length > 0 ? 'warning' : 'success'}
      title={t('applied', { applied: result.applied, failed: result.failed.length })}
    >
      {result.failed.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {result.failed.map(f => (
            <li key={`${f.employeeExternalId}|${f.sessionExternalId}`}>
              {t('failure', {
                name: names.get(f.employeeExternalId) ?? f.employeeExternalId,
                session: sessions.get(f.sessionExternalId) ?? f.sessionExternalId,
                reason: t(`reasons.${f.reason}`),
              })}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  )
}
