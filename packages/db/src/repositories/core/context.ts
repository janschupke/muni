import {
  type ComplianceCell,
  type ComplianceOptions,
  computeCompliance,
  DEFAULT_EXPIRING_DAYS,
} from '@muni/domain/compliance'
import { loadPolicy, type SanitizePolicy } from '@muni/domain/sanitize'
import { isoDateFromUtc, todayIn } from '@muni/utils/dates'

import { type Db, getDb } from '../../client'
import { ACTIVE } from '../archive/archive'
import { audienceSelect, mandatoryCourse, rulesOf } from '../catalog/audience'
import { stillEmployed } from '../people/employment'

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
  /** Override the clock: what has started, what is still ahead (tests). */
  now?: Date
}

export const dbOf = (options?: RepoOptions) => options?.db ?? getDb()

/** A stored amount (a Prisma Decimal, or a sum of them) in crowns; null stays null. */
export function toAmount(value: { toString(): string }): number
export function toAmount(value: { toString(): string } | null): number | null
export function toAmount(value: { toString(): string } | null): number | null {
  return value === null ? null : Number(value.toString())
}

/** Options of a read that can take a compliance snapshot already loaded for the request. */
export type WithCompliance = RepoOptions & {
  compliance?: Promise<ComplianceSnapshot> | undefined
}

export interface ComplianceSnapshot {
  options: ComplianceOptions
  cells: ComplianceCell[]
  employees: { id: string; departmentId: string | null; status: string }[]
}

/** Which people and courses a compliance load covers; everything when left out. */
export interface ComplianceScope {
  employeeIds?: readonly string[] | undefined
  courseIds?: readonly string[] | undefined
}

/**
 * Loads everything compliance needs and evaluates it in memory. At this register's size
 * (~170 people × 10 courses) that is a few milliseconds; a SQL view is the scaling path.
 * People who have left (by `asOf`), archived people, courses and completions are excluded.
 * A page about one person or one course loads only theirs (`scope`); a page that needs it
 * for several things loads it once and hands the snapshot on (`compliance` in their options).
 */
export async function loadCompliance(
  options?: RepoOptions & { scope?: ComplianceScope | undefined }
): Promise<ComplianceSnapshot> {
  const db = dbOf(options)
  const complianceOpts = complianceOptions(options?.asOf)
  const employed = stillEmployed(complianceOpts.asOf)
  const people = options?.scope?.employeeIds
  const courses = options?.scope?.courseIds
  const [employees, requirements, completions] = await Promise.all([
    db.employee.findMany({
      where: { ...ACTIVE, ...employed, ...(people && { id: { in: [...people] } }) },
      select: { id: true, departmentId: true, positionId: true, status: true },
    }),
    db.course.findMany({
      where: { ...mandatoryCourse, ...ACTIVE, ...(courses && { id: { in: [...courses] } }) },
      select: { id: true, ...audienceSelect },
    }),
    db.courseCompletion.findMany({
      where: {
        ...ACTIVE,
        employee: { ...ACTIVE, ...employed },
        course: ACTIVE,
        ...(people && { employeeId: { in: [...people] } }),
        ...(courses && { courseId: { in: [...courses] } }),
      },
      select: { employeeId: true, courseId: true, completedOn: true, validUntil: true },
    }),
  ])
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
