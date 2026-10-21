import 'server-only'

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
import {
  COMMIT_CHUNK_SIZE,
  COMMIT_ORDER,
  committable,
  type DatasetKind,
  type DatasetRecord,
  type ImportBatch,
} from '@muni/importer'
import type * as z from 'zod'

import type { Db } from './client'
import {
  ensureDefaultProvider,
  offerWhatWasDelivered,
  writeCompletions,
} from './import/completions'
import { writeCourses } from './import/courses'
import { activeEmployeeRecords, linkManagers, writeEmployees } from './import/employees'
import { writeRooms } from './import/rooms'
import { writeSessions } from './import/sessions'
import { CommitRefusedError, type CommitResult, MissingReferenceError } from './import/shared'
import { fillDepartmentHeads } from './repositories/org/groups'

export { type CommitRefusal, CommitRefusedError, type CommitResult } from './import/shared'

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
 * re-importing the same file is idempotent). Callers send datasets in COMMIT_ORDER, people
 * managers first (`committable`), so each chunk's manager links find their managers.
 *
 * `last` marks a dataset's final chunk, after which what needs all of it is worked out once:
 * the departments' heads from the reporting lines (people); the offerings the completions
 * show, at the latest price paid, and the default provider (completions). Each only fills
 * what is not set, so a repeat changes nothing. Who still works there is judged on `asOf`,
 * and which sessions are still ahead on `now` (today and the real clock unless a caller says
 * otherwise).
 */
export async function commitChunk(
  db: Db,
  kind: DatasetKind,
  untrusted: unknown[],
  { last, asOf, now }: { last: boolean; asOf?: string | undefined; now?: Date | undefined }
): Promise<CommitResult> {
  if (untrusted.length > COMMIT_CHUNK_SIZE) {
    throw new Error(`At most ${COMMIT_CHUNK_SIZE} records per chunk`)
  }
  const records = revalidate(kind, untrusted)
  try {
    const result = await db.$transaction(async tx => {
      switch (kind) {
        case 'rooms':
          return writeRooms(tx, records as RoomInput[], now ?? new Date())
        case 'courses':
          return writeCourses(tx, records as CourseInput[])
        case 'employees': {
          const { kept, skipped } = await activeEmployeeRecords(tx, records as EmployeeInput[])
          const written = await writeEmployees(tx, kept)
          await linkManagers(tx, kept)
          return { ...written, skipped }
        }
        case 'sessions':
          return writeSessions(tx, records as SessionInput[])
        case 'completions': {
          const written = await writeCompletions(tx, records as CompletionInput[])
          if (last) {
            await offerWhatWasDelivered(tx)
            await ensureDefaultProvider(tx)
          }
          return written
        }
      }
    }, TX_OPTIONS)
    if (last && kind === 'employees') await fillDepartmentHeads({ db, ...(asOf && { asOf }) })
    return result
  } catch (error) {
    // Named by its record, as the other refusals are, rather than a bare failure.
    if (error instanceof MissingReferenceError) {
      const named = JSON.stringify(error.key)
      const index = records.findIndex(r => JSON.stringify(r).includes(named))
      throw new CommitRefusedError(index, 'REFERENCE_MISSING', `${error.what} ${error.key}`)
    }
    throw error
  }
}

/**
 * Writes a validated batch as the import wizard does: dataset by dataset in COMMIT_ORDER, a
 * chunk at a time (`chunkSize`, at most COMMIT_CHUNK_SIZE), each dataset's last chunk marked.
 * The first refusal stops it; what was written before stays.
 */
export async function importBatch(
  db: Db,
  batch: ImportBatch,
  {
    chunkSize = COMMIT_CHUNK_SIZE,
    asOf,
  }: { chunkSize?: number | undefined; asOf?: string | undefined } = {}
): Promise<Partial<Record<DatasetKind, CommitResult>>> {
  const results: Partial<Record<DatasetKind, CommitResult>> = {}
  for (const kind of COMMIT_ORDER) {
    if ((batch[kind]?.length ?? 0) === 0) continue
    const records = committable(batch, kind)
    const sum = { created: 0, updated: 0, unchanged: 0, skipped: 0 }
    for (let i = 0; i < records.length; i += chunkSize) {
      const part = records.slice(i, i + chunkSize)
      const result = await commitChunk(db, kind, part, {
        last: i + chunkSize >= records.length,
        asOf,
      })
      sum.created += result.created
      sum.updated += result.updated
      sum.unchanged += result.unchanged
      sum.skipped += result.skipped
    }
    results[kind] = sum
  }
  return results
}
