import 'server-only'

import * as z from 'zod'

import { type ListParam, listParam } from '@/lib/search-params'
import type { SessionUser } from '@/server/auth'

/** What JSON cannot carry: a read that returns one of these fails to compile. */
type NotJson =
  Date | Map<unknown, unknown> | Set<unknown> | bigint | ((...args: never[]) => unknown)

/** `true` when `T` holds something JSON would change or drop, anywhere inside. */
type HasNonJson<T> = T extends NotJson
  ? true
  : T extends readonly (infer U)[]
    ? HasNonJson<U>
    : T extends object
      ? true extends { [K in keyof T]-?: HasNonJson<T[K]> }[keyof T]
        ? true
        : false
      : false

/**
 * A page's data read: who may run it, what its address says (a query string, parsed by
 * `input`), and the load. `null` means the record is not there (404). The result goes to the
 * browser as JSON, so it must survive JSON as it is.
 */
export interface Read<S extends z.ZodType<Record<string, unknown>>, O> {
  guard: 'reader' | 'admin'
  input: S
  load: (input: z.output<S>, user: SessionUser) => Promise<O | null>
}

export function read<S extends z.ZodType<Record<string, unknown>>, O>(
  definition: Read<S, O> & (true extends HasNonJson<O> ? { notJson: never } : unknown)
): Read<S, O> {
  return definition
}

/** The addresses reads take: nothing, a record's id, its external ID, a course's code. */
export const none = z.object({})
export const byId = z.object({ id: z.string().min(1).max(64) })
export const byExternalId = z.object({ externalId: z.string().min(1).max(32) })
export const byCode = z.object({ code: z.string().min(1).max(32) })

const listFields = <K extends string>(keys: readonly [K, ...K[]]) => ({
  sort: z.enum(keys).optional(),
  dir: z.literal('desc').optional(),
  page: z.coerce.number().int().min(1).optional(),
})
type ListFields<K extends string> = ReturnType<typeof listFields<K>>

/**
 * A list's sort and page, as its read takes them from the address (see `parseList`): the
 * columns it sorts by are the list's own, and a page's second list names its parameters with
 * `prefix` (`completionsSort`, `completionsPage`).
 */
export function listInput<K extends string, P extends string = ''>(
  keys: readonly [K, ...K[]],
  prefix: P = '' as P
): { [N in keyof ListFields<K> as ListParam<P, N>]: ListFields<K>[N] } {
  const fields = listFields(keys)
  return {
    [listParam(prefix, 'sort')]: fields.sort,
    [listParam(prefix, 'dir')]: fields.dir,
    [listParam(prefix, 'page')]: fields.page,
  } as { [N in keyof ListFields<K> as ListParam<P, N>]: ListFields<K>[N] }
}
