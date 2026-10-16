import { FORECAST_MONTHS } from '@muni/domain/advisor'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { useTranslations } from 'next-intl'

const RULES = ['scope', 'remedied', 'overbooking', 'order', 'choice', 'unplaced'] as const

/** The advisor's one fixed rule, in words. `planAssignments` implements exactly this. */
export function AdvisorRules() {
  const t = useTranslations('advisor.rules')
  return (
    <Card>
      <CardHeader title={t('title')} />
      <CardBody>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-fg-muted marker:text-fg-subtle">
          {RULES.map(rule => (
            <li key={rule}>{t(rule, { months: FORECAST_MONTHS })}</li>
          ))}
        </ol>
      </CardBody>
    </Card>
  )
}
