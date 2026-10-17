import { type Archivable, archiveTag, type UserRef } from '@muni/domain/archive'
import { canWrite, type Role } from '@muni/domain/enums'
import { isoDateFromUtc } from '@muni/utils/dates'

import type { Tx } from '../client'
import { ACTIVE, toUserRef, userSelect } from './archive'
import { dbOf, type RepoOptions } from './context'
import { stateOf } from './employment'
import { type SessionProblem, storedSessionProblem } from './mutations'
import { lockSessions } from './session-fit'

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
  /** A session ahead with seats taken: cancel it first. */
  | 'HAS_BOOKINGS'
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

type ArchiveOptions = RepoOptions & { now?: Date }

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

/** Upcoming means planned and not yet ended, as everywhere else. */
const upcoming = (now: Date) => ({ ...ACTIVE, status: 'PLANNED' as const, endsAt: { gte: now } })

/**
 * Whether the active record may be archived, and what goes with it. Run under the row lock
 * (and the session lock for rooms and courses), so the answer holds until the write.
 */
async function impactOf(
  tx: Tx,
  kind: Archivable,
  id: string,
  by: string | null,
  now: Date
): Promise<ArchiveImpact> {
  switch (kind) {
    case 'employee': {
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
    }
    case 'course': {
      const count = await tx.courseSession.count({ where: { courseId: id, ...upcoming(now) } })
      return count > 0
        ? { ok: false, reason: 'HAS_UPCOMING_SESSIONS', count }
        : { ok: true, removesBookings: 0 }
    }
    case 'room': {
      const count = await tx.courseSession.count({ where: { roomId: id, ...upcoming(now) } })
      return count > 0 ? { ok: false, reason: 'IN_USE', count } : { ok: true, removesBookings: 0 }
    }
    case 'session': {
      const session = await tx.courseSession.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          startsAt: true,
          unnamedBookings: true,
          _count: { select: { assignments: true } },
        },
      })
      const seats = session.unnamedBookings + session._count.assignments
      const ahead = session.status === 'PLANNED' && session.startsAt > now
      return ahead && seats > 0
        ? { ok: false, reason: 'HAS_BOOKINGS', count: seats }
        : { ok: true, removesBookings: 0 }
    }
    case 'department':
    case 'position': {
      const count = await tx.employee.count({
        where: { ...ACTIVE, [kind === 'department' ? 'departmentId' : 'positionId']: id },
      })
      return count > 0 ? { ok: false, reason: 'IN_USE', count } : { ok: true, removesBookings: 0 }
    }
    case 'user': {
      if (id === by) return { ok: false, reason: 'SELF', count: 0 }
      const user = await tx.user.findUniqueOrThrow({ where: { id }, select: { role: true } })
      if (user.role !== 'ADMIN') return { ok: true, removesBookings: 0 }
      // Lock the admins too, so two admins archiving each other cannot both pass.
      const admins = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM users WHERE role = 'ADMIN' AND archived_at IS NULL ORDER BY id FOR UPDATE`
      return admins.some(a => a.id !== id)
        ? { ok: true, removesBookings: 0 }
        : { ok: false, reason: 'LAST_ADMIN', count: 0 }
    }
    case 'completion':
    case 'provider':
      return { ok: true, removesBookings: 0 }
  }
}

async function locked<T>(
  tx: Tx,
  kind: Archivable,
  id: string,
  run: () => Promise<T>
): Promise<T | 'NOT_FOUND'> {
  // Session writes and archiving a room or course take turns.
  if (kind === 'room' || kind === 'course') await lockSessions(tx)
  const row = await lockRow(tx, kind, id)
  if (row?.archived_at !== null) return 'NOT_FOUND'
  return run()
}

/** What archiving an active record would do now; the confirm dialog shows it. */
export async function archiveImpact(
  kind: Archivable,
  id: string,
  options?: ArchiveOptions
): Promise<ArchiveImpact> {
  const now = options?.now ?? new Date()
  // A read: no locks, the write re-checks under them.
  const db = dbOf(options)
  const exists = await delegate(db, kind).count({ where: { id, ...ACTIVE } })
  if (exists === 0) return { ok: false, reason: 'NOT_FOUND', count: 0 }
  return impactOf(db, kind, id, null, now)
}

/**
 * Archives an active record on behalf of `byUserId`. An employee's bookings on sessions that
 * have not started go with them (their past bookings stay, as history).
 */
export async function archiveRecord(
  kind: Archivable,
  id: string,
  byUserId: string,
  options?: ArchiveOptions
): Promise<ArchiveImpact> {
  const now = options?.now ?? new Date()
  return dbOf(options).$transaction(async tx => {
    const result = await locked(tx, kind, id, async () => {
      const impact = await impactOf(tx, kind, id, byUserId, now)
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
  options?: ArchiveOptions
): Promise<UnarchiveOutcome> {
  const config = KINDS[kind]
  const now = options?.now ?? new Date()
  try {
    return await dbOf(options).$transaction(async tx => {
      // A session comes back into a room and a course: it takes turns with session writes and
      // with archiving either of them, as they take the same lock.
      if (kind === 'session') await lockSessions(tx)
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
    if ((error as { code?: unknown }).code !== 'P2002') throw error
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

// ---- reading archived records (admins only) -------------------------------------------

/** One archived record in an admin's list. People appear by tag only, even to admins. */
export interface ArchivedItem {
  id: string
  /** What the record is called; null for people (employees, users), who show their tag. */
  label: string | null
  /** A second line (a course's name, a session's or completion's course); never a person. */
  detail: string | null
  /** When it happened, for sessions (start) and completions (date). */
  when: ArchivedField | null
  tag: string
  archivedAt: string
  archivedBy: UserRef | null
}

const archivedBySelect = { archivedAt: true, archivedBy: { select: userSelect } } as const

const text = (key: string, value: string | number | null): ArchivedField => ({
  key,
  value,
  type: 'text',
})
const date = (key: string, value: Date | null): ArchivedField => ({
  key,
  value: value && isoDateFromUtc(value),
  type: 'date',
})
const datetime = (key: string, value: Date | null): ArchivedField => ({
  key,
  value: value?.toISOString() ?? null,
  type: 'datetime',
})

interface ArchivedRow {
  id: string
  archivedAt: Date | null
  /** People carry a stored random tag; other records are tagged from their id. */
  archiveTag?: string | null
  archivedBy: {
    id: string
    name: string | null
    email: string | null
    archivedAt: Date | null
    archiveTag: string | null
  } | null
}

function item(
  row: ArchivedRow,
  label: string | null,
  detail: string | null = null,
  when: ArchivedField | null = null
): ArchivedItem {
  return {
    id: row.id,
    label,
    detail,
    when,
    tag: row.archiveTag ?? archiveTag(row.id),
    archivedAt: (row.archivedAt ?? new Date(0)).toISOString(),
    archivedBy: row.archivedBy ? toUserRef(row.archivedBy) : null,
  }
}

const ARCHIVED = { archivedAt: { not: null } } as const
const NEWEST = { archivedAt: 'desc' } as const

function assertAdmin(role: Role) {
  if (!canWrite(role)) throw new Error('Archived records are for admins only')
}

/** Every archived record of a kind, most recently archived first. Admins only. */
export async function listArchived(
  kind: Archivable,
  role: Role,
  options?: RepoOptions
): Promise<ArchivedItem[]> {
  assertAdmin(role)
  const db = dbOf(options)
  const base = { where: ARCHIVED, orderBy: NEWEST } as const
  switch (kind) {
    case 'employee':
      return (
        await db.employee.findMany({
          ...base,
          select: { id: true, archiveTag: true, ...archivedBySelect },
        })
      ).map(r => item(r, null))
    case 'user':
      return (
        await db.user.findMany({
          ...base,
          select: { id: true, archiveTag: true, ...archivedBySelect },
        })
      ).map(r => item(r, null))
    case 'course':
      return (
        await db.course.findMany({
          ...base,
          select: { id: true, code: true, name: true, ...archivedBySelect },
        })
      ).map(r => item(r, r.code, r.name))
    case 'session':
      return (
        await db.courseSession.findMany({
          ...base,
          select: {
            id: true,
            externalId: true,
            startsAt: true,
            course: { select: { code: true, name: true } },
            ...archivedBySelect,
          },
        })
      ).map(r =>
        item(r, r.externalId, `${r.course.code} ${r.course.name}`, datetime('startsAt', r.startsAt))
      )
    case 'completion':
      return (
        await db.courseCompletion.findMany({
          ...base,
          select: {
            id: true,
            externalId: true,
            completedOn: true,
            course: { select: { code: true, name: true } },
            ...archivedBySelect,
          },
        })
      ).map(r =>
        item(
          r,
          r.externalId,
          `${r.course.code} ${r.course.name}`,
          date('completedOn', r.completedOn)
        )
      )
    case 'department':
      return (
        await db.department.findMany({
          ...base,
          select: { id: true, name: true, ...archivedBySelect },
        })
      ).map(r => item(r, r.name))
    case 'position':
      return (
        await db.position.findMany({
          ...base,
          select: { id: true, name: true, ...archivedBySelect },
        })
      ).map(r => item(r, r.name))
    case 'room':
      return (
        await db.room.findMany({ ...base, select: { id: true, name: true, ...archivedBySelect } })
      ).map(r => item(r, r.name))
    case 'provider':
      return (
        await db.provider.findMany({
          ...base,
          select: { id: true, name: true, ...archivedBySelect },
        })
      ).map(r => item(r, r.name))
  }
}

/** A field of an archived record, as its admin page lists it. */
export interface ArchivedField {
  /** Translated by the web app as `archive.fields.<key>`. */
  key: string
  value: string | number | null
  /** How to format `value`. */
  type: 'text' | 'date' | 'datetime'
}

export interface ArchivedRecord extends ArchivedItem {
  kind: Archivable
  /** The record's own name, revealed: for a person, their real name. */
  title: string
  fields: ArchivedField[]
}

/**
 * One archived record with its real details, for its own admin page: the one place an archived
 * person's name is shown. Null when there is no such archived record. Admins only.
 */
export async function getArchivedRecord(
  kind: Archivable,
  id: string,
  role: Role,
  options?: RepoOptions
): Promise<ArchivedRecord | null> {
  assertAdmin(role)
  const db = dbOf(options)
  const where = { id, ...ARCHIVED }
  const record = (
    row: ArchivedRow,
    title: string,
    fields: ArchivedField[],
    label: string | null = title
  ) => ({
    ...item(row, label),
    kind,
    title,
    fields,
  })
  switch (kind) {
    case 'employee': {
      const e = await db.employee.findFirst({
        where,
        select: {
          id: true,
          externalId: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          hiredOn: true,
          leftOn: true,
          archiveTag: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
          ...archivedBySelect,
        },
      })
      return (
        e &&
        record(
          e,
          `${e.lastName} ${e.firstName}`,
          [
            text('externalId', e.externalId),
            text('email', e.email),
            text('department', e.department?.name ?? null),
            text('position', e.position?.name ?? null),
            // Where they stood when archived: LEFT once their leaving date had come.
            text('status', stateOf(e, isoDateFromUtc(e.archivedAt ?? new Date()))),
            date('hiredOn', e.hiredOn),
            date('leftOn', e.leftOn),
          ],
          null
        )
      )
    }
    case 'user': {
      const u = await db.user.findFirst({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          lastSignInAt: true,
          archiveTag: true,
          ...archivedBySelect,
        },
      })
      return (
        u &&
        record(
          u,
          u.name ?? u.email ?? u.archiveTag ?? u.id,
          [text('email', u.email), text('role', u.role), datetime('lastSignInAt', u.lastSignInAt)],
          null
        )
      )
    }
    case 'course': {
      const c = await db.course.findFirst({
        where,
        select: { id: true, code: true, name: true, validityMonths: true, ...archivedBySelect },
      })
      return (
        c &&
        record(
          c,
          `${c.code} ${c.name}`,
          [text('code', c.code), text('name', c.name), text('validityMonths', c.validityMonths)],
          c.code
        )
      )
    }
    case 'session': {
      const s = await db.courseSession.findFirst({
        where,
        select: {
          id: true,
          externalId: true,
          startsAt: true,
          endsAt: true,
          capacity: true,
          status: true,
          course: { select: { code: true, name: true } },
          room: { select: { name: true } },
          ...archivedBySelect,
        },
      })
      return (
        s &&
        record(
          s,
          `${s.externalId} ${s.course.name}`,
          [
            text('externalId', s.externalId),
            text('course', `${s.course.code} ${s.course.name}`),
            datetime('startsAt', s.startsAt),
            datetime('endsAt', s.endsAt),
            text('room', s.room.name),
            text('capacity', s.capacity),
            text('status', s.status),
          ],
          s.externalId
        )
      )
    }
    case 'completion': {
      const c = await db.courseCompletion.findFirst({
        where,
        select: {
          id: true,
          externalId: true,
          completedOn: true,
          validUntil: true,
          course: { select: { code: true, name: true } },
          provider: { select: { name: true } },
          ...archivedBySelect,
        },
      })
      return (
        c &&
        record(
          c,
          `${c.externalId} ${c.course.name}`,
          [
            text('externalId', c.externalId),
            text('course', `${c.course.code} ${c.course.name}`),
            date('completedOn', c.completedOn),
            date('validUntil', c.validUntil),
            text('provider', c.provider?.name ?? null),
          ],
          c.externalId
        )
      )
    }
    case 'department':
    case 'position': {
      const model = kind === 'department' ? db.department : db.position
      const g = await (model as typeof db.department).findFirst({
        where,
        select: { id: true, name: true, ...archivedBySelect },
      })
      return g && record(g, g.name, [text('name', g.name)])
    }
    case 'room': {
      const r = await db.room.findFirst({
        where,
        select: {
          id: true,
          name: true,
          kind: true,
          capacity: true,
          note: true,
          ...archivedBySelect,
        },
      })
      return (
        r &&
        record(r, r.name, [
          text('name', r.name),
          text('kind', r.kind),
          text('capacity', r.capacity),
          text('note', r.note),
        ])
      )
    }
    case 'provider': {
      const p = await db.provider.findFirst({
        where,
        select: {
          id: true,
          name: true,
          companyId: true,
          email: true,
          phone: true,
          website: true,
          ...archivedBySelect,
        },
      })
      return (
        p &&
        record(p, p.name, [
          text('name', p.name),
          text('companyId', p.companyId),
          text('email', p.email),
          text('phone', p.phone),
          text('website', p.website),
        ])
      )
    }
  }
}
