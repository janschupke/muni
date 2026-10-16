'use client'

import {
  planAssignments,
  settingsToQuery,
  type AdvisorInput,
  type AdvisorSettings,
  type OverbookedSession,
  type Suggestion,
} from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { Badge } from '@muni/ui/badge'
import { Button } from '@muni/ui/button'
import { StatCard } from '@muni/ui/stat-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@muni/ui/tabs'
import { formatCurrency, formatInteger, formatPercent } from '@muni/utils/format'
import { CalendarCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useDeferredValue, useMemo, useState, useTransition } from 'react'

import {
  applyAssignmentsAction,
  moveSeatsAction,
  type ApplyResult,
} from '@/server/actions/assignments'

import { Calculator, Formula } from './calculator'
import { DemandChart } from './demand-chart'
import { OverbookedList } from './overbooked-list'
import { PlanTable } from './plan-table'
import { UnresolvedTable } from './unresolved-table'

type Outcome =
  | { kind: 'applied'; result: ApplyResult; names: Map<string, string> }
  | { kind: 'moved'; moved: number; failed: number }
  | { kind: 'error' }

/**
 * The advisor: an adjustable calculator on the left, the plan it produces on the right.
 * The plan is recomputed in the browser on every change (it is a pure function of the data
 * and the settings); the settings are mirrored into the URL so a plan can be shared.
 */
export function AdvisorWorkbench({
  input,
  initialSettings,
  canApply,
}: {
  input: AdvisorInput
  initialSettings: AdvisorSettings
  canApply: boolean
}) {
  const t = useTranslations('advisor')
  const locale = useLocale()
  const [settings, setSettings] = useState(initialSettings)
  const deferred = useDeferredValue(settings)
  const plan = useMemo(() => planAssignments(input, deferred), [input, deferred])
  const [tab, setTab] = useState('plan')
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const changeSettings = (next: AdvisorSettings) => {
    setSettings(next)
    const query = new URLSearchParams(settingsToQuery(next)).toString()
    // Native history keeps Next's router in sync without a server round trip per slider step.
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }

  const apply = (suggestions: Suggestion[]) => {
    startTransition(async () => {
      try {
        const result = await applyAssignmentsAction(
          suggestions.map(s => ({
            sessionExternalId: s.session.externalId,
            employeeExternalId: s.need.employee.externalId,
            source: 'ADVISOR' as const,
            score: Math.round(s.score * 100) / 100,
          }))
        )
        const names = new Map(
          suggestions.map(s => [s.need.employee.externalId, s.need.employee.name])
        )
        setOutcome({ kind: 'applied', result, names })
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

  const m = plan.metrics
  const pct = (value: number) => formatPercent(value, locale)
  const n = (value: number) => formatInteger(value, locale)

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-6 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
        <Calculator settings={settings} onChange={changeSettings} />
        <Formula settings={settings} window={input.expiringWithinDays} />
      </aside>

      <div className="flex min-w-0 flex-col gap-6" aria-busy={settings !== deferred}>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <StatCard
            label={t('kpi.compliance')}
            value={pct(m.complianceAfter)}
            hint={t('kpi.from', { value: pct(m.complianceBefore) })}
            tone="accent"
          />
          <StatCard
            label={t('kpi.utilisation')}
            value={pct(m.utilisationAfter)}
            hint={t('kpi.from', { value: pct(m.utilisationBefore) })}
          />
          <StatCard
            label={t('kpi.overbooked')}
            value={n(m.overbookedAfter)}
            hint={t('kpi.from', { value: n(m.overbookedBefore) })}
            tone={m.overbookedAfter > 0 ? 'danger' : 'success'}
          />
          <StatCard
            label={t('kpi.open')}
            value={n(m.openAfter)}
            hint={t('kpi.fromCovered', { value: n(m.openBefore), covered: plan.covered.length })}
            tone={m.openAfter > 0 ? 'warning' : 'success'}
          />
          <StatCard
            label={t('kpi.cost')}
            value={formatCurrency(m.cost, locale)}
            hint={t('kpi.costHint', { count: plan.suggestions.length })}
          />
        </div>

        {outcome && <OutcomeAlert outcome={outcome} />}

        <DemandChart demand={plan.demand} />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="plan">
              {t('tabs.plan')}
              <Badge>{n(plan.suggestions.length)}</Badge>
            </TabsTrigger>
            <TabsTrigger value="overbooked">
              {t('tabs.overbooked')}
              <Badge tone={plan.overbooked.length > 0 ? 'danger' : 'neutral'}>
                {n(plan.overbooked.length)}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="unresolved">
              {t('tabs.unresolved')}
              <Badge tone={plan.unresolved.length > 0 ? 'warning' : 'neutral'}>
                {n(plan.unresolved.length)}
              </Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="plan" className="flex flex-col gap-3">
            {canApply ? (
              plan.suggestions.length > 0 && (
                <div>
                  <Button
                    variant="primary"
                    disabled={pending}
                    onClick={() => {
                      apply(plan.suggestions)
                    }}
                  >
                    <CalendarCheck aria-hidden />
                    {t('plan.applyAll', { count: plan.suggestions.length })}
                  </Button>
                </div>
              )
            ) : (
              <Alert tone="info" role="none">
                {t('plan.signInToApply')}
              </Alert>
            )}
            <PlanTable
              suggestions={plan.suggestions}
              asOf={input.asOf}
              onApply={
                canApply
                  ? s => {
                      apply([s])
                    }
                  : undefined
              }
              pending={pending}
            />
          </TabsContent>
          <TabsContent value="overbooked">
            <OverbookedList
              overbooked={plan.overbooked}
              onMove={canApply ? move : undefined}
              pending={pending}
            />
          </TabsContent>
          <TabsContent value="unresolved">
            <UnresolvedTable
              unresolved={plan.unresolved}
              shortfall={plan.shortfall}
              horizonDays={settings.horizonDays}
            />
          </TabsContent>
        </Tabs>
      </div>
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
  const { result, names } = outcome
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
                session: f.sessionExternalId,
                reason: t(`reasons.${f.reason}`),
              })}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  )
}
