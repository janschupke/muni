import { COMPLIANCE_STATUSES } from '@muni/domain/enums'
import type { ComplianceCounts } from '@muni/domain/compliance'
import { StackedBar } from '@muni/ui/charts/stacked-bar'
import { cn } from '@muni/ui/cn'
import { getTranslations } from 'next-intl/server'

import { COMPLIANCE_FILL } from './status-badges'

/** Part-to-whole bar of the four compliance states. */
export async function ComplianceBar({
  counts,
  label,
}: {
  counts: ComplianceCounts
  label: string
}) {
  const t = await getTranslations('status.compliance')
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
export async function ComplianceLegend({ className }: { className?: string }) {
  const t = await getTranslations('status.compliance')
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted', className)}>
      {COMPLIANCE_STATUSES.map(status => (
        <li key={status} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2.5 rounded-sm', COMPLIANCE_FILL[status])} />
          {t(status)}
        </li>
      ))}
    </ul>
  )
}
