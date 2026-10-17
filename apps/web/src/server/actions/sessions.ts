'use server'

import {
  checkSessionSlot,
  createSession,
  createSessionWithBookings,
  type PlannedSessionWrite,
  type SessionWrite,
} from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { sessionCreateSchema } from '@muni/domain/schemas'
import * as z from 'zod'

import { formError, type FormState, sessionProblem } from '@/lib/form'
import { parseForm, sessionCreateSpec } from '@/lib/form-inputs'
import { getSessionUser, requireAdmin } from '@/server/auth'

const plannedInput = z.object({
  session: sessionCreateSchema,
  people: z.array(z.string().trim().min(1).max(32)).max(500),
  dryRun: z.boolean(),
})

/** What creating a planned session came to, or why the server would not take it at all. */
export type PlannedOutcome =
  PlannedSessionWrite | { ok: false; problem: 'unauthorized' | 'invalid' | 'failed'; refusals: [] }

/**
 * Creates the session a planner offer turned into, and books the people chosen on it, all or
 * nothing. `dryRun` checks the same way and writes nothing: the review the user sees first.
 * Every way it can fail comes back as an answer the review shows.
 */
export async function createPlannedSessionAction(input: unknown): Promise<PlannedOutcome> {
  // Signed out meanwhile (an expired session) or no longer an admin: say so, rather than
  // throwing into the page.
  const user = await getSessionUser()
  if (!user || !canWrite(user.role)) return { ok: false, problem: 'unauthorized', refusals: [] }
  const parsed = plannedInput.safeParse(input)
  if (!parsed.success) return { ok: false, problem: 'invalid', refusals: [] }
  const { session, people, dryRun } = parsed.data
  try {
    return await createSessionWithBookings(session, people, user.id, { dryRun })
  } catch (error) {
    console.error(error)
    return { ok: false, problem: 'failed', refusals: [] }
  }
}

/**
 * The "new session" form, from a course's page (that course chosen to start with) or the
 * sessions list; opens the new session.
 */
export async function saveNewSession(_state: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()
  const parsed = parseForm(sessionCreateSpec, form)
  if (!parsed.ok) return parsed.state
  let result: SessionWrite
  try {
    result = await createSession(parsed.data)
  } catch (error) {
    console.error(error)
    return formError('generic')
  }
  if (!result.ok) return sessionProblem(result.problem)
  return { status: 'saved', href: `/sessions/${result.externalId}` }
}

const slotSchema = z.object({
  roomId: z.string().min(1).max(64),
  date: z.iso.date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
})

/**
 * Whether another planned session holds the room then, for the session form to say while
 * the user picks. Admins only (only they see the form); anything else answers nothing.
 * Saving checks again under the lock.
 */
export async function checkSessionSlotAction(
  slot: z.infer<typeof slotSchema>,
  self: string | null
): Promise<'ROOM_BUSY' | null> {
  const user = await getSessionUser()
  if (!user || !canWrite(user.role)) return null
  const parsed = slotSchema.safeParse(slot)
  if (!parsed.success || (self !== null && typeof self !== 'string')) return null
  try {
    return await checkSessionSlot(parsed.data, self)
  } catch (error) {
    console.error(error)
    return null
  }
}
