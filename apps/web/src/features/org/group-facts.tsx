import { BarRow } from '@muni/ui/bar-row'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { Meter } from '@muni/ui/meter'
import { formatInteger, formatPercent } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ComplianceBar } from '@/components/compliance-breakdown'
import { rateTone } from '@/components/status-badges'

/** The numbers every department and position page opens with. */
export function GroupFacts({
  group,
  labels,
  children,
}: {
  group: {
    name: string
    active: number
    parentalLeave: number
    counts: { VALID: number; EXPIRING: number; EXPIRED: number; MISSING: number; total: number }
    rate: number
  }
  labels: { active: string; onLeave: string }
  children?: ReactNode
}) {
  const t = useTranslations('departments.columns')
  const locale = useLocale()
  const held = group.counts.VALID + group.counts.EXPIRING
  return (
    <div className="flex flex-col gap-4">
      <DescriptionList>
        {children}
        <DescriptionItem label={labels.active}>
          {formatInteger(group.active, locale)}
        </DescriptionItem>
        <DescriptionItem label={labels.onLeave}>
          {formatInteger(group.parentalLeave, locale)}
        </DescriptionItem>
      </DescriptionList>
      {group.counts.total > 0 && (
        <>
          <BarRow
            label={t('compliance')}
            value={`${formatPercent(group.rate, locale)} · ${held} / ${group.counts.total}`}
            bar={
              <Meter
                value={held}
                max={group.counts.total}
                label={t('compliance')}
                tone={rateTone(group.rate)}
                size="md"
              />
            }
          />
          <ComplianceBar counts={group.counts} label={group.name} />
        </>
      )}
    </div>
  )
}
