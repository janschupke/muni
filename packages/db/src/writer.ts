import {
  APP_ID_PREFIX,
  type CompletionInput,
  completionSchema,
  type CourseInput,
  courseSchema,
  type EmployeeInput,
  employeeSchema,
  type RoomInput,
  roomSchema,
  type SessionInput,
  sessionSchema,
} from '@muni/domain/schemas'
import type { DatasetKind, DatasetRecord } from '@muni/importer'
import type * as z from 'zod'

import type { Db } from './client'
import { writeCompletions } from './import/completions'
import { writeCourses } from './import/courses'
import { activeEmployeeRecords, linkManagers, writeEmployees } from './import/employees'
import { writeRooms } from './import/rooms'
import { writeSessions } from './import/sessions'
import type { CommitResult } from './import/shared'

export { type CommitRefusal, CommitRefusedError, type CommitResult } from './import/shared'

export const COMMIT_CHUNK_SIZE = 500
const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 }

const notReserved = (
  prefix: string
): [(r: { externalId: string }) => boolean, { path: PropertyKey[]; message: string }] => [
  r => !r.externalId.startsWith(prefix),
  { path: ['externalId'], message: 'RESERVED_ID' },
]

/**
 * The server never trusts records coming back from the browser: every record is re-parsed
 * with the domain schema and its free text re-sanitised before anything is written.
 * IDs with the prefix the app gives what it creates (S…, A…, N…) are refused here as the
 * browser's importer refuses them: an import must never overwrite a record made in the app.
 */
const SCHEMAS = {
  rooms: roomSchema,
  courses: courseSchema,
  employees: employeeSchema.refine(...notReserved(APP_ID_PREFIX.employee)),
  sessions: sessionSchema.refine(...notReserved(APP_ID_PREFIX.session)),
  completions: completionSchema.refine(...notReserved(APP_ID_PREFIX.completion)),
} satisfies Record<DatasetKind, z.ZodType>

export class CommitValidationError extends Error {
  override name = 'CommitValidationError'
  constructor(
    readonly index: number,
    readonly issues: z.core.$ZodIssue[]
  ) {
    super(`Record ${index} failed validation`)
  }
}

export function revalidate<K extends DatasetKind>(kind: K, records: unknown[]): DatasetRecord[K][] {
  const schema = SCHEMAS[kind] as unknown as z.ZodType<DatasetRecord[K]>
  return records.map((record, index) => {
    const parsed = schema.safeParse(record)
    if (!parsed.success) throw new CommitValidationError(index, parsed.error.issues)
    return parsed.data
  })
}

/**
 * Writes one chunk of one dataset in a single transaction (upsert by source ID, so
 * re-importing the same file is idempotent). Callers send datasets in COMMIT_ORDER.
 * Employee chunks also re-link managers, which may live in an earlier chunk.
 */
export async function commitChunk(
  db: Db,
  kind: DatasetKind,
  untrusted: unknown[]
): Promise<CommitResult> {
  if (untrusted.length > COMMIT_CHUNK_SIZE) {
    throw new Error(`At most ${COMMIT_CHUNK_SIZE} records per chunk`)
  }
  const records = revalidate(kind, untrusted)
  return db.$transaction(async tx => {
    switch (kind) {
      case 'rooms':
        return writeRooms(tx, records as RoomInput[])
      case 'courses':
        return writeCourses(tx, records as CourseInput[])
      case 'employees': {
        const { kept, skipped } = await activeEmployeeRecords(tx, records as EmployeeInput[])
        const result = await writeEmployees(tx, kept)
        await linkManagers(tx, kept)
        return { ...result, skipped }
      }
      case 'sessions':
        return writeSessions(tx, records as SessionInput[])
      case 'completions':
        return writeCompletions(tx, records as CompletionInput[])
    }
  }, TX_OPTIONS)
}

export function chunk<T>(items: readonly T[], size = COMMIT_CHUNK_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
