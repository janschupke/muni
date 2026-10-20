import { compliancePercent } from '@muni/domain/compliance'
import { formatPercent } from '@muni/utils/format'

/**
 * A compliance rate as it is printed everywhere: the whole percent, rounded down, which is
 * also what its colour band is taken from (`complianceBand`). Never `formatPercent` on a rate.
 */
export function formatRate(rate: number, locale: string): string {
  return formatPercent(compliancePercent(rate) / 100, locale)
}
