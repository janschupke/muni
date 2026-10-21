import { fold } from '@muni/utils/text'

import type { Tx } from '../client'
import { ACTIVE } from '../repositories/archive/archive'
import { toAmount } from '../repositories/core/context'

export interface CommitResult {
  created: number
  updated: number
  /** Records the register already holds as they are: nothing written. */
  unchanged: number
  /** Records left alone because they are, or refer to, something archived. */
  skipped: number
}

/**
 * Whether writing `data` would change what the row holds, each field compared as the database
 * keeps it (a date by its instant, a decimal by its value). An unchanged record is not
 * written: a re-import costs a read, and `updatedAt` keeps the time of the last real change.
 */
export function differs(held: Record<string, unknown>, data: Record<string, unknown>): boolean {
  return Object.entries(data).some(([field, value]) => !same(held[field], value))
}

function same(held: unknown, value: unknown): boolean {
  if (held instanceof Date) return value instanceof Date && held.getTime() === value.getTime()
  // A Prisma Decimal against the number the import writes.
  if (held !== null && typeof held === 'object') return toAmount(held) === value
  return held === value
}

/** The same values, in any order and however often each comes. */
export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a)
  const right = new Set(b)
  return left.size === right.size && [...left].every(value => right.has(value))
}

// Every lookup here is among active records: an archived record's name, code or ID is free for
// a new one. A record whose own key, or anything it refers to, matches ONLY archived records is
// skipped (the review shows it as ARCHIVED): an import never revives an archived record, and
// never creates an active twin of one.

type Keyed = 'department' | 'position' | 'provider' | 'room' | 'course' | 'employee'
type KeyField = 'name' | 'code' | 'externalId' | 'email'

/**
 * Which values only archived records hold. Names compare folded (case and accents), as the
 * importer and `upsertNames` match them; codes, IDs and emails exactly.
 */
export async function archivedOnly(
  tx: Tx,
  model: Keyed | 'courseSession' | 'courseCompletion',
  field: KeyField,
  values: Iterable<string | null>
): Promise<(value: string) => boolean> {
  const wanted = [...new Set([...values].filter((v): v is string => v !== null))]
  if (wanted.length === 0) return () => false
  const delegate = tx[model] as unknown as {
    findMany(args: object): Promise<Record<string, unknown>[]>
  }
  const key = field === 'name' ? (v: unknown) => fold(String(v)) : (v: unknown) => v
  const rows = await delegate.findMany({
    ...(field !== 'name' && { where: { [field]: { in: wanted } } }),
    select: { [field]: true, archivedAt: true },
  })
  const active = new Set(rows.filter(r => r['archivedAt'] === null).map(r => key(r[field])))
  const archived = new Set(
    rows
      .filter(r => r['archivedAt'] !== null)
      .map(r => key(r[field]))
      .filter(k => !active.has(k))
  )
  return value => archived.has(key(value))
}

/** Splits off the records that touch something archived. */
export function withoutArchived<T>(
  records: T[],
  checks: [(value: string) => boolean, (r: T) => (string | null)[]][]
): { kept: T[]; skipped: number } {
  const kept = records.filter(
    r => !checks.some(([isArchived, keys]) => keys(r).some(k => k !== null && isArchived(k)))
  )
  return { kept, skipped: records.length - kept.length }
}

/**
 * Why a valid record still cannot be written: it would take a room an app-planned session
 * holds then (`ROOM_BUSY`), or leave upcoming sessions in a room that no longer suits them
 * (`ROOM_UNFIT`), as the room and session forms refuse.
 */
export type CommitRefusal =
  | 'ROOM_BUSY'
  | 'ROOM_UNFIT'
  /** A session names a provider there is no (active) record of. */
  | 'PROVIDER_UNKNOWN'
  /** A session names a provider that does not offer its course. */
  | 'PROVIDER_NOT_OFFERING'
  /** A session names no provider, and no provider is the default. */
  | 'NO_DEFAULT_PROVIDER'
  /**
   * A record names something the register does not have (an employee, course or room the
   * review saw, archived or gone since, or skipped from an earlier chunk).
   */
  | 'REFERENCE_MISSING'

export class CommitRefusedError extends Error {
  override name = 'CommitRefusedError'
  constructor(
    readonly index: number,
    readonly reason: CommitRefusal,
    /** The record's key, and what it clashes with where there is one ("T012 → S004"). */
    readonly key: string
  ) {
    super(`Record ${index} (${key}) refused: ${reason}`)
  }
}

/**
 * The id of each name's active record, created where there is none. Names match folded (case
 * and accents: "Personalni oddeleni" is "Personální oddělení"), so a spelling variant never
 * makes a twin; a new record keeps the first spelling met. Creating takes a lock per table,
 * so two imports cannot both create the same name.
 */
export async function upsertNames(
  tx: Tx,
  model: 'department' | 'position' | 'provider',
  names: Iterable<string>
): Promise<Map<string, string>> {
  const unique = [...new Set(names)]
  if (unique.length === 0) return new Map()
  const delegate = tx[model] as unknown as {
    create(args: { data: { name: string }; select: { id: true } }): Promise<{ id: string }>
    findMany(args: {
      where: { archivedAt: null }
      select: { id: true; name: true }
    }): Promise<{ id: string; name: string }[]>
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`names:${model}`}))`
  const rows = await delegate.findMany({ where: ACTIVE, select: { id: true, name: true } })
  const byKey = new Map(rows.map(r => [fold(r.name), r.id]))
  const ids = new Map<string, string>()
  for (const name of unique) {
    let id = byKey.get(fold(name))
    if (id === undefined) {
      id = (await delegate.create({ data: { name }, select: { id: true } })).id
      byKey.set(fold(name), id)
    }
    ids.set(name, id)
  }
  return ids
}

/**
 * Splits records into new and existing by external key; each existing one comes with the row
 * as the register holds it (`held`), to compare with what the import would write.
 */
export async function partition<T, H extends { id: string }>(
  records: T[],
  keyOf: (r: T) => string,
  findExisting: (keys: string[]) => Promise<{ key: string; held: H }[]>
): Promise<{ fresh: T[]; existing: { record: T; held: H }[] }> {
  const found = new Map((await findExisting(records.map(keyOf))).map(e => [e.key, e.held]))
  const fresh: T[] = []
  const existing: { record: T; held: H }[] = []
  for (const record of records) {
    const held = found.get(keyOf(record))
    if (held) existing.push({ record, held })
    else fresh.push(record)
  }
  return { fresh, existing }
}

export async function courseIds(tx: Tx, codes: string[]): Promise<Map<string, string>> {
  const rows = await tx.course.findMany({
    where: { code: { in: [...new Set(codes)] }, ...ACTIVE },
    select: { id: true, code: true },
  })
  return new Map(rows.map(c => [c.code, c.id]))
}

/** A record names a key the register has no active record of. */
export class MissingReferenceError extends Error {
  override name = 'MissingReferenceError'
  constructor(
    readonly what: string,
    readonly key: string
  ) {
    super(`Unknown ${what} "${key}"`)
  }
}

export function lookup<T>(map: Map<string, T>, key: string, what: string): T {
  const value = map.get(key)
  if (value === undefined) throw new MissingReferenceError(what, key)
  return value
}
