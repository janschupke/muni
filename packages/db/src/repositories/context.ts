import {
  type ComplianceCell,
  type ComplianceOptions,
  computeCompliance,
  DEFAULT_EXPIRING_DAYS,
} from '@muni/domain/compliance'
import { loadPolicy, type SanitizePolicy } from '@muni/domain/sanitize'
import { isoDateFromUtc, todayIn } from '@muni/utils/dates'

import { type Db, getDb } from '../client'
import { ACTIVE } from './archive'
import { audienceSelect, mandatoryCourse, rulesOf } from './audience'

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

/** A stored amount (a Prisma Decimal, or a sum of them) in crowns; null stays null. */
export function toAmount(value: { toString(): string } | null): number | null {
  return value === null ? null : Number(value.toString())
}

export interface ComplianceSnapshot {
  options: ComplianceOptions
  cells: ComplianceCell[]
  employees: { id: string; departmentId: string | null; status: string }[]
}

/**
 * Loads everything compliance needs and evaluates it in memory. At this register's size
 * (~170 people × 10 courses) that is a few milliseconds; a SQL view is the scaling path.
 * Terminated and archived employees, archived courses and archived completions are excluded.
 */
export async function loadCompliance(options?: RepoOptions): Promise<ComplianceSnapshot> {
  const db = dbOf(options)
  const [employees, requirements, completions] = await Promise.all([
    db.employee.findMany({
      where: { ...ACTIVE, status: { not: 'TERMINATED' } },
      select: { id: true, departmentId: true, positionId: true, status: true },
    }),
    db.course.findMany({
      where: { ...mandatoryCourse, ...ACTIVE },
      select: { id: true, ...audienceSelect },
    }),
    db.courseCompletion.findMany({
      where: { ...ACTIVE, employee: { ...ACTIVE, status: { not: 'TERMINATED' } }, course: ACTIVE },
      select: { employeeId: true, courseId: true, completedOn: true, validUntil: true },
    }),
  ])
  const complianceOpts = complianceOptions(options?.asOf)
  const cells = computeCompliance(
    employees,
    requirements.flatMap(rulesOf),
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

/**
 * The cells that count toward a rate: active people's. People on parental leave are listed
 * with their trainings but not counted, here as on the matrix and the department pages.
 */
export function countedCells(snapshot: ComplianceSnapshot): ComplianceCell[] {
  const active = new Set(snapshot.employees.filter(e => e.status === 'ACTIVE').map(e => e.id))
  return snapshot.cells.filter(c => active.has(c.employeeId))
}
