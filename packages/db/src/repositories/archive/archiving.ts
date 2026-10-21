import type { Archivable } from '@muni/domain/archive'
import { sessionPhase } from '@muni/domain/sessions'

import type { Tx } from '../../client'
import { dbOf, nowOf, type RepoOptions } from '../core/context'
import { isPrismaCode } from '../core/errors'
import { type SessionProblem, storedSessionProblem } from '../records/mutations'
import { lockSessionWrites } from '../scheduling/session-fit'
import { upcomingSessionWhere } from '../scheduling/sessions'
import { ACTIVE } from './archive'

// Archiving and unarchiving. Nothing in the app deletes a record: archiving hides it from every
// list and count, keeps its history, and frees its unique keys for a new record. Each rule below
// runs inside the transaction that writes, under the same lock the competing writes take.

/** Why a record cannot be archived now. `count` says how many things are in the way. */
export type ArchiveRefusal =
  | 'NOT_FOUND'
  /** A department or position with people in it; a room with sessions ahead. */
  | 'IN_USE'
  /** A course with sessions still ahead. */
  | 'HAS_UPCOMING_SESSIONS'
  /** A session still to start: it is cancelled, not archived. */
  | 'UPCOMING'
  /** The provider imported sessions with none go to: make another the default first. */
  | 'DEFAULT_PROVIDER'
  /** Admins cannot archive themselves. */
  | 'SELF'
  /** The last active admin stays. */
  | 'LAST_ADMIN'

/** What archiving would do: refuse (and why), or go ahead and remove this many future bookings. */
export type ArchiveImpact =
  | {
      ok: true
      removesBookings: number
      /** The department a person leads, which is left without a head. */
      leaves?: string | undefined
    }
  | { ok: false; reason: ArchiveRefusal; count: number }

/** A unique key an active record now holds, so the archived one cannot come back. */
export type UniqueField = 'name' | 'code' | 'externalId' | 'email' | 'companyId' | 'clerkId'

export type UnarchiveOutcome =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'PARENT_ARCHIVED' }
  | { ok: false; reason: 'TAKEN'; fields: UniqueField[] }
  /** An upcoming session whose room is now taken then, or no longer suits it. */
  | { ok: false; reason: 'SESSION'; problem: SessionProblem }

/** Table, Prisma model, unique keys and parents (which must be active to unarchive) per kind. */
const KINDS = {
  employee: {
    table: 'employees',
    model: 'employee',
    unique: ['externalId', 'email'],
    parents: [
      ['department', 'departmentId'],
      ['position', 'positionId'],
    ],
  },
  course: { table: 'courses', model: 'course', unique: ['code'], parents: [] },
  session: {
    table: 'course_sessions',
    model: 'courseSession',
    unique: ['externalId'],
    parents: [
      ['course', 'courseId'],
      ['room', 'roomId'],
      ['provider', 'providerId'],
    ],
  },
  completion: {
    table: 'course_completions',
    model: 'courseCompletion',
    unique: ['externalId'],
    parents: [
      ['employee', 'employeeId'],
      ['course', 'courseId'],
    ],
  },
  department: { table: 'departments', model: 'department', unique: ['name'], parents: [] },
  position: { table: 'positions', model: 'position', unique: ['name'], parents: [] },
  room: { table: 'rooms', model: 'room', unique: ['name'], parents: [] },
  provider: { table: 'providers', model: 'provider', unique: ['name', 'companyId'], parents: [] },
  user: { table: 'users', model: 'user', unique: ['clerkId'], parents: [] },
} as const satisfies Record<
  Archivable,
  {
    table: string
    model: string
    unique: readonly UniqueField[]
    parents: readonly (readonly [Archivable, string])[]
  }
>

type Row = Record<string, unknown> & { id: string; archivedAt: Date | null }
interface Delegate {
  findUnique(args: object): Promise<Row | null>
  findFirst(args: object): Promise<Row | null>
  findMany(args: object): Promise<Row[]>
  count(args: object): Promise<number>
  update(args: object): Promise<unknown>
}
const delegate = (tx: Tx, kind: Archivable) => tx[KINDS[kind].model] as unknown as Delegate

/**
 * Holds a parent's row while a child comes back, so archiving the parent (which locks it for
 * update and counts its children) waits, and sees the child.
 */
async function shareRow(tx: Tx, kind: Archivable, id: string) {
  const [row] = await tx.$queryRawUnsafe<{ archived_at: Date | null }[]>(
    `SELECT archived_at FROM ${KINDS[kind].table} WHERE id = $1 FOR SHARE`,
    id
  )
  return row ?? null
}

/** Locks the record's row; its archived state is read under the lock. */
async function lockRow(tx: Tx, kind: Archivable, id: string) {
  // The table name comes from the closed KINDS map, never from the caller.
  const [row] = await tx.$queryRawUnsafe<{ archived_at: Date | null }[]>(
    `SELECT archived_at FROM ${KINDS[kind].table} WHERE id = $1 FOR UPDATE`,
    id
  )
  return row ?? null
}

const FREE: ArchiveImpact = { ok: true, removesBookings: 0 }

/** Refused with `reason` while `count` things are in the way; otherwise free to go. */
const unless = (reason: ArchiveRefusal, count: number): ArchiveImpact =>
  count > 0 ? { ok: false, reason, count } : FREE

type ImpactCheck = (
  tx: Tx,
  id: string,
  context: { by: string | null; now: Date }
) => Promise<ArchiveImpact>

/**
 * Whether an active record may be archived, and what goes with it, per kind. Run under the row
 * lock (and the session lock for rooms, courses and providers), so the answer holds until the
 * write.
 */
const IMPACT: Record<Archivable, ImpactCheck> = {
  employee: async (tx, id, { now }) => {
    const [removesBookings, person] = await Promise.all([
      tx.sessionAssignment.count({
        where: { employeeId: id, session: { startsAt: { gt: now } } },
      }),
      tx.employee.findUniqueOrThrow({
        where: { id },
        select: { leadsDepartment: true, department: { select: { name: true } } },
      }),
    ])
    return {
      ok: true,
      removesBookings,
      ...(person.leadsDepartment && person.department && { leaves: person.department.name }),
    }
  },
  course: async (tx, id, { now }) =>
    unless(
      'HAS_UPCOMING_SESSIONS',
      await tx.courseSession.count({ where: { courseId: id, ...upcomingSessionWhere(now) } })
    ),
  room: async (tx, id, { now }) =>
    unless(
      'IN_USE',
      await tx.courseSession.count({ where: { roomId: id, ...upcomingSessionWhere(now) } })
    ),
  session: async (tx, id, { now }) => {
    const session = await tx.courseSession.findUniqueOrThrow({
      where: { id },
      select: {
        status: true,
        startsAt: true,
        endsAt: true,
        unnamedBookings: true,
        _count: { select: { assignments: true } },
      },
    })
    // One still to start is cancelled instead (its bookings stay as history); once under
    // way, over or cancelled, it can go.
    return sessionPhase(session, now) === 'AHEAD'
      ? {
          ok: false,
          reason: 'UPCOMING',
          count: session.unnamedBookings + session._count.assignments,
        }
      : FREE
  },
  department: async (tx, id) =>
    unless('IN_USE', await tx.employee.count({ where: { ...ACTIVE, departmentId: id } })),
  position: async (tx, id) =>
    unless('IN_USE', await tx.employee.count({ where: { ...ACTIVE, positionId: id } })),
  user: async (tx, id, { by }) => {
    if (id === by) return { ok: false, reason: 'SELF', count: 0 }
    const user = await tx.user.findUniqueOrThrow({ where: { id }, select: { role: true } })
    if (user.role !== 'ADMIN') return FREE
    // Lock the admins too, so two admins archiving each other cannot both pass.
    const admins = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE role = 'ADMIN' AND archived_at IS NULL ORDER BY id FOR UPDATE`
    return admins.some(a => a.id !== id) ? FREE : { ok: false, reason: 'LAST_ADMIN', count: 0 }
  },
  provider: async (tx, id, { now }) => {
    const provider = await tx.provider.findUniqueOrThrow({
      where: { id },
      select: { isDefault: true },
    })
    if (provider.isDefault) return { ok: false, reason: 'DEFAULT_PROVIDER', count: 0 }
    // Its sessions ahead are cancelled or given to another provider first.
    return unless(
      'IN_USE',
      await tx.courseSession.count({ where: { providerId: id, ...upcomingSessionWhere(now) } })
    )
  },
  completion: () => Promise.resolve(FREE),
}

async function locked<T>(
  tx: Tx,
  kind: Archivable,
  id: string,
  run: () => Promise<T>
): Promise<T | 'NOT_FOUND'> {
  // Session writes and archiving a room, course or provider take turns.
  if (kind === 'room' || kind === 'course' || kind === 'provider') await lockSessionWrites(tx)
  const row = await lockRow(tx, kind, id)
  if (row?.archived_at !== null) return 'NOT_FOUND'
  return run()
}

/** What archiving an active record would do now; the confirm dialog shows it. */
export async function archiveImpact(
  kind: Archivable,
  id: string,
  options?: RepoOptions
): Promise<ArchiveImpact> {
  const now = nowOf(options)
  // A read: no locks, the write re-checks under them.
  const db = dbOf(options)
  const exists = await delegate(db, kind).count({ where: { id, ...ACTIVE } })
  if (exists === 0) return { ok: false, reason: 'NOT_FOUND', count: 0 }
  return IMPACT[kind](db, id, { by: null, now })
}

/**
 * Archives an active record on behalf of `byUserId`. An employee's bookings on sessions that
 * have not started go with them (their past bookings stay, as history).
 */
export async function archiveRecord(
  kind: Archivable,
  id: string,
  byUserId: string,
  options?: RepoOptions
): Promise<ArchiveImpact> {
  const now = nowOf(options)
  return dbOf(options).$transaction(async tx => {
    const result = await locked(tx, kind, id, async () => {
      const impact = await IMPACT[kind](tx, id, { by: byUserId, now })
      if (!impact.ok) return impact
      if (kind === 'employee') {
        await tx.sessionAssignment.deleteMany({
          where: { employeeId: id, session: { startsAt: { gt: now } } },
        })
      }
      await delegate(tx, kind).update({
        where: { id },
        // An archived person leads nothing: their department gets a new head on its form.
        data: {
          archivedAt: now,
          archivedById: byUserId,
          ...(kind === 'employee' && { leadsDepartment: false }),
        },
      })
      return impact
    })
    return result === 'NOT_FOUND' ? { ok: false, reason: 'NOT_FOUND', count: 0 } : result
  })
}

/**
 * Brings an archived record back, unless an active record now holds one of its unique keys
 * (`TAKEN`) or something it belongs to is archived (`PARENT_ARCHIVED`).
 */
export async function unarchiveRecord(
  kind: Archivable,
  id: string,
  options?: RepoOptions
): Promise<UnarchiveOutcome> {
  const config = KINDS[kind]
  const now = nowOf(options)
  try {
    return await dbOf(options).$transaction(async tx => {
      // A session comes back into a room and a course: it takes turns with session writes and
      // with archiving either of them, as they take the same lock.
      if (kind === 'session') await lockSessionWrites(tx)
      const lock = await lockRow(tx, kind, id)
      if (!lock?.archived_at) return { ok: false, reason: 'NOT_FOUND' }
      const row = await delegate(tx, kind).findUnique({ where: { id } })
      if (!row) return { ok: false, reason: 'NOT_FOUND' }

      for (const [parent, field] of config.parents) {
        const parentId = row[field]
        if (typeof parentId !== 'string') continue
        const held = await shareRow(tx, parent, parentId)
        if (held?.archived_at !== null) return { ok: false, reason: 'PARENT_ARCHIVED' }
      }
      const taken = await takenFields(tx, kind, row)
      if (taken.length > 0) return { ok: false, reason: 'TAKEN', fields: taken }
      if (kind === 'session') {
        const problem = await storedSessionProblem(tx, id, now)
        if (problem) return { ok: false, reason: 'SESSION', problem }
      }

      await delegate(tx, kind).update({
        where: { id },
        data: { archivedAt: null, archivedById: null },
      })
      return { ok: true }
    })
  } catch (error) {
    // Another record took the key between the check and the write (the index refused it).
    if (!isPrismaCode(error, 'P2002')) throw error
    return { ok: false, reason: 'TAKEN', fields: [...config.unique] }
  }
}

async function takenFields(tx: Tx, kind: Archivable, row: Row): Promise<UniqueField[]> {
  const taken: UniqueField[] = []
  for (const field of KINDS[kind].unique) {
    const value = row[field]
    if (value === null || value === undefined) continue
    const holder = await delegate(tx, kind).count({
      where: { [field]: value, ...ACTIVE, id: { not: row.id } },
    })
    if (holder > 0) taken.push(field)
  }
  return taken
}
