import { type Archivable, archiveTag, type UserRef } from '@muni/domain/archive'
import { canWrite, type Role } from '@muni/domain/enums'
import { sortName } from '@muni/domain/names'
import { isoDateFromUtc } from '@muni/utils/dates'

import { dbOf, type RepoOptions } from '../core/context'
import { stateOf } from '../people/employment'
import { toUserRef, userSelect } from './archive'

// Reading archived records, for admins only: each kind's list, and one record's own page (the
// one place an archived person's name is shown).

/** A field of an archived record, as its admin page lists it. */
export interface ArchivedField {
  /** Translated by the web app as `archive.fields.<key>`. */
  key: string
  value: string | number | null
  /** How to format `value`. */
  type: 'text' | 'date' | 'datetime'
}

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

export interface ArchivedRecord extends ArchivedItem {
  kind: Archivable
  /** The record's own name, revealed: for a person, their real name. */
  title: string
  fields: ArchivedField[]
}

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

/** One record's page: its real name, its fields, and the label its list shows. */
const record = (
  row: ArchivedRow,
  title: string,
  fields: ArchivedField[],
  label: string | null = title
): Omit<ArchivedRecord, 'kind'> => ({ ...item(row, label), title, fields })

type Db = ReturnType<typeof dbOf>

interface ArchivedView {
  /** Every archived record of the kind, most recently archived first. */
  list: (db: Db) => Promise<ArchivedItem[]>
  /** One archived record with its real details; null when there is no such archived record. */
  detail: (db: Db, id: string) => Promise<Omit<ArchivedRecord, 'kind'> | null>
}

const archivedBySelect = { archivedAt: true, archivedBy: { select: userSelect } } as const
const ARCHIVED = { archivedAt: { not: null } } as const
const LIST = { where: ARCHIVED, orderBy: { archivedAt: 'desc' } } as const
const archived = (id: string) => ({ id, ...ARCHIVED })
const TAGGED = { id: true, archiveTag: true, ...archivedBySelect } as const
const NAMED = { id: true, name: true, ...archivedBySelect } as const

const VIEWS: Record<Archivable, ArchivedView> = {
  employee: {
    list: async db =>
      (await db.employee.findMany({ ...LIST, select: TAGGED })).map(r => item(r, null)),
    detail: async (db, id) => {
      const e = await db.employee.findFirst({
        where: archived(id),
        select: {
          ...TAGGED,
          externalId: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          hiredOn: true,
          leftOn: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      })
      return (
        e &&
        record(
          e,
          sortName(e),
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
    },
  },
  user: {
    list: async db => (await db.user.findMany({ ...LIST, select: TAGGED })).map(r => item(r, null)),
    detail: async (db, id) => {
      const u = await db.user.findFirst({
        where: archived(id),
        select: { ...TAGGED, name: true, email: true, role: true, lastSignInAt: true },
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
    },
  },
  course: {
    list: async db =>
      (await db.course.findMany({ ...LIST, select: { ...NAMED, code: true } })).map(r =>
        item(r, r.code, r.name)
      ),
    detail: async (db, id) => {
      const c = await db.course.findFirst({
        where: archived(id),
        select: { ...NAMED, code: true, validityMonths: true },
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
    },
  },
  session: {
    list: async db =>
      (
        await db.courseSession.findMany({
          ...LIST,
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
      ),
    detail: async (db, id) => {
      const s = await db.courseSession.findFirst({
        where: archived(id),
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
    },
  },
  completion: {
    list: async db =>
      (
        await db.courseCompletion.findMany({
          ...LIST,
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
      ),
    detail: async (db, id) => {
      const c = await db.courseCompletion.findFirst({
        where: archived(id),
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
    },
  },
  department: {
    list: async db =>
      (await db.department.findMany({ ...LIST, select: NAMED })).map(r => item(r, r.name)),
    detail: async (db, id) => {
      const g = await db.department.findFirst({ where: archived(id), select: NAMED })
      return g && record(g, g.name, [text('name', g.name)])
    },
  },
  position: {
    list: async db =>
      (await db.position.findMany({ ...LIST, select: NAMED })).map(r => item(r, r.name)),
    detail: async (db, id) => {
      const g = await db.position.findFirst({ where: archived(id), select: NAMED })
      return g && record(g, g.name, [text('name', g.name)])
    },
  },
  room: {
    list: async db =>
      (await db.room.findMany({ ...LIST, select: NAMED })).map(r => item(r, r.name)),
    detail: async (db, id) => {
      const r = await db.room.findFirst({
        where: archived(id),
        select: { ...NAMED, kind: true, capacity: true, note: true },
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
    },
  },
  provider: {
    list: async db =>
      (await db.provider.findMany({ ...LIST, select: NAMED })).map(r => item(r, r.name)),
    detail: async (db, id) => {
      const p = await db.provider.findFirst({
        where: archived(id),
        select: { ...NAMED, companyId: true, email: true, phone: true, website: true },
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
    },
  },
}

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
  return VIEWS[kind].list(dbOf(options))
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
  const found = await VIEWS[kind].detail(dbOf(options), id)
  return found && { ...found, kind }
}
