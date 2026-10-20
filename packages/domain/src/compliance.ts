import { diffInDays, type IsoDate } from '@muni/utils/dates'

import type { ComplianceStatus, EmploymentStatus, RequirementScope } from './enums'

export interface ComplianceEmployee {
  id: string
  departmentId: string | null
  positionId: string | null
  status: EmploymentStatus
}

export interface ComplianceRequirement {
  courseId: string
  scope: RequirementScope
  departmentId: string | null
  positionId: string | null
}

export interface ComplianceCompletion {
  employeeId: string
  courseId: string
  completedOn: IsoDate
  /** null = never expires */
  validUntil: IsoDate | null
}

export interface ComplianceCell {
  employeeId: string
  courseId: string
  status: ComplianceStatus
  /** The completion the status was derived from, if any. */
  basis: ComplianceCompletion | null
}

export interface ComplianceOptions {
  asOf: IsoDate
  /** A valid completion that expires within this many days counts as EXPIRING. */
  expiringWithinDays: number
}

export const DEFAULT_EXPIRING_DAYS = 30

export function appliesTo(
  requirement: ComplianceRequirement,
  employee: ComplianceEmployee
): boolean {
  switch (requirement.scope) {
    case 'ALL':
      return true
    case 'DEPARTMENT':
      return requirement.departmentId !== null && requirement.departmentId === employee.departmentId
    case 'POSITION':
      return requirement.positionId !== null && requirement.positionId === employee.positionId
  }
}

/** Course ids the employee must hold, given every requirement rule. */
function requiredCourseIds(
  employee: ComplianceEmployee,
  requirements: readonly ComplianceRequirement[]
): Set<string> {
  const ids = new Set<string>()
  for (const requirement of requirements) {
    if (appliesTo(requirement, employee)) ids.add(requirement.courseId)
  }
  return ids
}

/**
 * Picks the completion that best covers the employee: a never-expiring one wins,
 * otherwise the one that is valid the longest. Future-dated completions don't count.
 */
export function bestCompletion(
  completions: readonly ComplianceCompletion[],
  asOf: IsoDate
): ComplianceCompletion | null {
  let best: ComplianceCompletion | null = null
  for (const completion of completions) {
    if (completion.completedOn > asOf) continue
    if (best === null) {
      best = completion
    } else if (completion.validUntil === null) {
      if (best.validUntil !== null || completion.completedOn > best.completedOn) best = completion
    } else if (best.validUntil !== null && completion.validUntil > best.validUntil) {
      best = completion
    }
  }
  return best
}

export function statusOf(
  completion: ComplianceCompletion | null,
  { asOf, expiringWithinDays }: ComplianceOptions
): ComplianceStatus {
  if (completion === null) return 'MISSING'
  if (completion.validUntil === null) return 'VALID'
  if (completion.validUntil < asOf) return 'EXPIRED'
  return diffInDays(asOf, completion.validUntil) <= expiringWithinDays ? 'EXPIRING' : 'VALID'
}

/** One cell per (employee, required course). */
export function computeCompliance(
  employees: readonly ComplianceEmployee[],
  requirements: readonly ComplianceRequirement[],
  completions: readonly ComplianceCompletion[],
  options: ComplianceOptions
): ComplianceCell[] {
  const byPair = new Map<string, ComplianceCompletion[]>()
  for (const completion of completions) {
    const key = `${completion.employeeId}|${completion.courseId}`
    const list = byPair.get(key)
    if (list) list.push(completion)
    else byPair.set(key, [completion])
  }

  const cells: ComplianceCell[] = []
  for (const employee of employees) {
    for (const courseId of requiredCourseIds(employee, requirements)) {
      const basis = bestCompletion(byPair.get(`${employee.id}|${courseId}`) ?? [], options.asOf)
      cells.push({ employeeId: employee.id, courseId, status: statusOf(basis, options), basis })
    }
  }
  return cells
}

export type ComplianceCounts = Record<ComplianceStatus, number> & { total: number }

export function countStatuses(cells: readonly ComplianceCell[]): ComplianceCounts {
  const counts: ComplianceCounts = { VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0, total: 0 }
  for (const cell of cells) {
    counts[cell.status] += 1
    counts.total += 1
  }
  return counts
}

/** Share of required trainings currently held (VALID or EXPIRING). 1 when nothing is required. */
export function complianceRate(counts: ComplianceCounts): number {
  if (counts.total === 0) return 1
  return (counts.VALID + counts.EXPIRING) / counts.total
}

/** What a count comes to: trainings held (valid or expiring), of how many, and the share. */
export function complianceOf(counts: ComplianceCounts): {
  held: number
  total: number
  rate: number
} {
  return { held: counts.VALID + counts.EXPIRING, total: counts.total, rate: complianceRate(counts) }
}

/**
 * Most urgent first, everywhere a status is ranked: a training that lapsed (the person is
 * working out of date now), one never held, one lapsing soon, one held.
 */
export const URGENCY: Record<ComplianceStatus, number> = {
  EXPIRED: 0,
  MISSING: 1,
  EXPIRING: 2,
  VALID: 3,
}

/** Sorts statuses most urgent first (`URGENCY`). */
export const compareUrgency = (a: ComplianceStatus, b: ComplianceStatus): number =>
  URGENCY[a] - URGENCY[b]

/** A person's overall status: their most urgent one (`URGENCY`); null with nothing required. */
export function worstStatus(statuses: Iterable<ComplianceStatus>): ComplianceStatus | null {
  let worst: ComplianceStatus | null = null
  for (const status of statuses) {
    if (worst === null || compareUrgency(status, worst) < 0) worst = status
  }
  return worst
}

/** What one department × course cell of the matrix counts. */
export interface MatrixCell {
  counts: ComplianceCounts
  rate: number
}

/**
 * The department-by-course grid of the active people's cells: each department's headcount at
 * work and, per course (keyed by code), its counts and rate, or null where the course applies
 * to nobody there. Departments with nobody at work are left out.
 */
export function departmentMatrix<D extends { id: string }>(
  departments: readonly D[],
  courses: readonly { id: string; code: string }[],
  employees: readonly { id: string; departmentId: string | null; status: string }[],
  cells: readonly ComplianceCell[]
): { department: D; headcount: number; cells: Record<string, MatrixCell | null> }[] {
  const active = employees.filter(e => e.status === 'ACTIVE')
  const departmentOf = new Map(active.map(e => [e.id, e.departmentId]))
  const headcount = Map.groupBy(active, e => e.departmentId)
  const byPair = Map.groupBy(
    cells.filter(c => departmentOf.has(c.employeeId)),
    c => `${departmentOf.get(c.employeeId) ?? ''}|${c.courseId}`
  )
  return departments.flatMap(department => {
    const people = headcount.get(department.id)?.length ?? 0
    if (people === 0) return []
    const row = Object.fromEntries(
      courses.map(course => {
        const pair = byPair.get(`${department.id}|${course.id}`)
        if (!pair) return [course.code, null]
        const counts = countStatuses(pair)
        return [course.code, { counts, rate: complianceRate(counts) }]
      })
    )
    return [{ department, headcount: people, cells: row }]
  })
}

/**
 * Rate bands, best first. A rate falls in the first band whose floor it reaches; the
 * matrix, the rate meters and the overview colour by band and always print the rate too.
 */
export const COMPLIANCE_BANDS = [
  { band: 'FULL', min: 1 },
  { band: 'HIGH', min: 0.9 },
  { band: 'FAIR', min: 0.75 },
  { band: 'LOW', min: 0.5 },
  { band: 'POOR', min: 0 },
] as const

export type ComplianceBand = (typeof COMPLIANCE_BANDS)[number]['band']

/**
 * The whole percent a rate is printed as, rounded down: 89.6 % reads 89 %, and only a full
 * rate reads 100 %. The band is taken from it, so a cell's colour and its number agree. (The
 * nudge absorbs float error: 0.29 × 100 is 28.999….)
 */
export function compliancePercent(rate: number): number {
  return Math.floor(rate * 100 + 1e-9)
}

/**
 * What each band covers, as its legend prints it, best first: the full rate (`to` null), then
 * ranges down to the last floor, then everything below it (`from` null). Bounds are rates, the
 * upper one a hundredth under the next band's floor (rates print as whole percent).
 */
export function bandRanges(): { band: ComplianceBand; from: number | null; to: number | null }[] {
  return COMPLIANCE_BANDS.map(({ band, min }, i) => {
    const above = COMPLIANCE_BANDS[i - 1]
    if (above === undefined) return { band, from: min, to: null }
    if (min === 0) return { band, from: null, to: above.min }
    return { band, from: min, to: above.min - 0.01 }
  })
}

export function complianceBand(rate: number): ComplianceBand {
  const percent = compliancePercent(rate)
  for (const { band, min } of COMPLIANCE_BANDS) if (percent >= Math.round(min * 100)) return band
  return 'POOR'
}
