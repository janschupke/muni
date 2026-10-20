import { czechCollator } from '@muni/utils/text'

import { compareUrgency } from '../compliance'
import type { AdvisorNeed } from './types'

/**
 * Queue order: most urgent first (expired, never completed, lapsing), then the longest lapsed
 * or the soonest to lapse; ties by name (Czech), employee ID and course code, so the plan never
 * depends on input order.
 */
export function compareQueue(a: AdvisorNeed, b: AdvisorNeed): number {
  return (
    compareUrgency(a.status, b.status) ||
    (a.validUntil ?? '').localeCompare(b.validUntil ?? '') ||
    czechCollator.compare(a.employee.name, b.employee.name) ||
    a.employee.externalId.localeCompare(b.employee.externalId) ||
    a.course.code.localeCompare(b.course.code)
  )
}
