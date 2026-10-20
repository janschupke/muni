import type { ComplianceStatus } from '@muni/domain/enums'

export const HEAD = 'border-b-0 px-2 py-1'
// The department column stays put while the courses scroll sideways on narrow screens.
// layer-row paints the row's hover over the column's own fill.
export const STICKY = 'sticky left-0 z-10 bg-surface-elevated layer-row'

// A person's cell: the status's own tint, icon and (for screen readers) words.
export const STATUS_CELL: Record<ComplianceStatus, string> = {
  VALID: 'bg-success-soft text-success-fg',
  EXPIRING: 'bg-warning-soft text-warning-fg',
  EXPIRED: 'bg-serious-soft text-serious-fg',
  MISSING: 'bg-danger-soft text-danger-fg',
}
