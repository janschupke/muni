import { FORECAST_MONTHS } from '@muni/domain/advisor'
import { useTranslations } from 'next-intl'

import { RulesCard } from '@/features/advisor/rules-card'

const RULES = ['scope', 'remedied', 'overbooking', 'order', 'choice', 'unplaced'] as const

/** The advisor's one fixed rule, in words. `planAssignments` implements exactly this. */
export function AdvisorRules() {
  const t = useTranslations('advisor.rules')
  return (
    <RulesCard title={t('title')} rules={RULES.map(rule => t(rule, { months: FORECAST_MONTHS }))} />
  )
}
