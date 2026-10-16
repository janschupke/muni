import type { ComplianceCounts } from '@muni/domain/compliance'
import { COMPLIANCE_STATUSES } from '@muni/domain/enums'
import { Legend } from '@muni/ui/charts/legend'
import { StackedBar } from '@muni/ui/charts/stacked-bar'
import { useTranslations } from 'next-intl'

import { COMPLIANCE_FILL } from './status-badges'

/** Part-to-whole bar of the four compliance states. */
export function ComplianceBar({ counts, label }: { counts: ComplianceCounts; label: string }) {
  const t = useTranslations('status.compliance')
  return (
    <StackedBar
      label={label}
      segments={COMPLIANCE_STATUSES.map(status => ({
        key: status,
        label: t(status),
        value: counts[status],
        fillClass: COMPLIANCE_FILL[status],
      }))}
    />
  )
}

/** Legend for every chart that uses the compliance colours. */
export function ComplianceLegend({ className }: { className?: string }) {
  const t = useTranslations('status.compliance')
  return (
    <Legend
      className={className}
      items={COMPLIANCE_STATUSES.map(status => ({
        key: status,
        label: t(status),
        swatchClassName: COMPLIANCE_FILL[status],
      }))}
    />
  )
}
