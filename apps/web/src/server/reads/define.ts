import 'server-only'

import type * as z from 'zod'

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
