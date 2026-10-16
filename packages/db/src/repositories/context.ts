import {
  computeCompliance,
  DEFAULT_EXPIRING_DAYS,
  type ComplianceCell,
  type ComplianceOptions,
} from '@muni/domain/compliance'
import { loadPolicy, type SanitizePolicy } from '@muni/domain/sanitize'
import { isoDateFromUtc, todayIn } from '@muni/utils/dates'

import { getDb, type Db } from '../client'

let policy: SanitizePolicy | undefined

/** The effective sanitisation policy. A bad MUNI_SANITIZE_POLICY throws on first use. */
export function getPolicy(): SanitizePolicy {
  policy ??= loadPolicy(process.env.MUNI_SANITIZE_POLICY)
  return policy
}

export function complianceOptions(asOf = todayIn()): ComplianceOptions {
  const raw = Number(process.env.MUNI_EXPIRING_DAYS)
  return {
    asOf,
    expiringWithinDays: Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_EXPIRING_DAYS,
  }
}

export interface RepoOptions {
  db?: Db
  /** Override "today" (tests). */
  asOf?: string
}

export const dbOf = (options?: RepoOptions) => options?.db ?? getDb()

export interface ComplianceSnapshot {
  options: ComplianceOptions
  cells: ComplianceCell[]
  employees: { id: string; departmentId: string | null; status: string }[]
}

/**
 * Loads everything compliance needs and evaluates it in memory. At this register's size
 * (~170 people × 10 courses) that is a few milliseconds; a SQL view is the scaling path.
 * Terminated employees are excluded.
 */
export async function loadCompliance(options?: RepoOptions): Promise<ComplianceSnapshot> {
  const db = dbOf(options)
  const [employees, requirements, completions] = await Promise.all([
    db.employee.findMany({
      where: { status: { not: 'TERMINATED' } },
      select: { id: true, departmentId: true, positionId: true, status: true },
    }),
    db.courseRequirement.findMany({
      select: { courseId: true, scope: true, departmentId: true, positionId: true },
    }),
    db.courseCompletion.findMany({
      where: { employee: { status: { not: 'TERMINATED' } } },
      select: { employeeId: true, courseId: true, completedOn: true, validUntil: true },
    }),
  ])
  const complianceOpts = complianceOptions(options?.asOf)
  const cells = computeCompliance(
    employees,
    requirements,
    completions.map(c => ({
      employeeId: c.employeeId,
      courseId: c.courseId,
      completedOn: isoDateFromUtc(c.completedOn),
      validUntil: c.validUntil ? isoDateFromUtc(c.validUntil) : null,
    })),
    complianceOpts
  )
  return { options: complianceOpts, cells, employees }
}
