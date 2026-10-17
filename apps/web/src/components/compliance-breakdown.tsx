import { type ComplianceCounts, complianceOf } from '@muni/domain/compliance'
import { COMPLIANCE_STATUSES } from '@muni/domain/enums'
import { BarRow } from '@muni/ui/bar-row'
import { Legend } from '@muni/ui/charts/legend'
import { StackedBar } from '@muni/ui/charts/stacked-bar'
import { Meter } from '@muni/ui/meter'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { formatRate } from '@/lib/format-rate'
import { useOfTotal } from '@/lib/use-of-total'

import { COMPLIANCE_FILL, rateTone } from './status-badges'

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

/** "86 % · 12 of 14": the share held, and held of required. */
export function useHeldText(): (counts: ComplianceCounts) => string {
  const locale = useLocale()
  const ofTotal = useOfTotal()
  return counts => {
    const { held, total, rate } = complianceOf(counts)
    return `${formatRate(rate, locale)} · ${ofTotal(held, total)}`
  }
}

/**
 * How a group's mandatory training stands, as one bar: the four states part to whole, with
 * the share held and held of required above it.
 */
export function ComplianceSummary({
  counts,
  label,
  name,
}: {
  counts: ComplianceCounts
  /** What the row is called on screen. */
  label: ReactNode
  /** Whose training it is: the bar's accessible name. */
  name: string
}) {
  const heldText = useHeldText()
  return (
    <BarRow
      label={label}
      value={heldText(counts)}
      bar={<ComplianceBar counts={counts} label={name} />}
    />
  )
}

/**
 * Trainings held of required, as a single bar with its figure beside it, toned by the share:
 * a table row's figure, where the breakdown would not fit.
 */
export function HeldMeter({
  counts,
  label,
  size,
  figure = 'count',
}: {
  counts: ComplianceCounts
  /** The bar's accessible name. */
  label: string
  size?: 'md' | undefined
  /** Beside the bar: "12 of 14", or the share, "86 %" (a group's row). */
  figure?: 'count' | 'share' | undefined
}) {
  const ofTotal = useOfTotal()
  const locale = useLocale()
  const { held, total, rate } = complianceOf(counts)
  return (
    <BarRow
      layout="inline"
      bar={<Meter value={held} max={total} label={label} tone={rateTone(rate)} size={size} />}
      value={figure === 'share' ? formatRate(rate, locale) : ofTotal(held, total)}
    />
  )
}

/** Legend for every chart that uses the compliance colours. */
export function ComplianceLegend({ className }: { className?: string | undefined }) {
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
