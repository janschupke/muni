'use server'

import {
  cancelSession,
  checkSessionSlot,
  createSession,
  createSessionWithBookings,
  type PlannedSessionWrite,
  reinstateSession,
  type SessionProblem,
  type SessionStatusRefusal,
} from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { sessionCreateSchema } from '@muni/domain/schemas'
import * as z from 'zod'

import { type FormState, sessionProblem } from '@/lib/form/form'
import { parseForm, sessionCreateSpec } from '@/lib/form/form-inputs'
import { getSessionUser } from '@/server/auth'

import {
  asAdmin,
  type Denied,
  failedWith,
  isBoundId,
  isBoundIdOrNull,
  logFailure,
  saveForm,
} from './guard'

const plannedInput = z.object({
  session: sessionCreateSchema,
  people: z.array(z.string().trim().min(1).max(32)).max(500),
  dryRun: z.boolean(),
})

/** What creating a planned session came to, or why the server would not take it at all. */
export type PlannedOutcome =
  PlannedSessionWrite | { ok: false; problem: Denied | 'invalid' | 'failed'; refusals: [] }

/**
 * Creates the session a planner offer turned into, and books the people chosen on it, all or
 * nothing. `dryRun` checks the same way and writes nothing: the review the user sees first.
 * Every way it can fail comes back as an answer the review shows.
 */
export async function createPlannedSessionAction(input: unknown): Promise<PlannedOutcome> {
  return asAdmin<PlannedOutcome>(
    async admin => {
      const parsed = plannedInput.safeParse(input)
      if (!parsed.success) return { ok: false, problem: 'invalid', refusals: [] }
      const { session, people, dryRun } = parsed.data
      return createSessionWithBookings(session, people, admin.id, { dryRun })
    },
    {
      denied: problem => ({ ok: false, problem, refusals: [] }),
      failed: error => {
        logFailure(error)
        return { ok: false, problem: 'failed', refusals: [] }
      },
    }
  )
}

/**
 * The "new session" form, from a course's page (that course chosen to start with) or the
 * sessions list; opens the new session.
 */
export async function saveNewSession(_state: FormState, form: FormData): Promise<FormState> {
  return saveForm(true, async () => {
    const parsed = parseForm(sessionCreateSpec, form)
    if (!parsed.ok) return parsed.state
    const result = await createSession(parsed.data)
    if (!result.ok) return sessionProblem(result.problem)
    return { status: 'saved', href: `/sessions/${result.externalId}` }
  })
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
  if (!parsed.success || !isBoundIdOrNull(self)) return null
  try {
    return await checkSessionSlot(parsed.data, self)
  } catch (error) {
    logFailure(error)
    return null
  }
}

/** What cancelling or reinstating a session came to, or why not. */
export type StatusOutcome =
  | { ok: true }
  | { ok: false; reason: SessionStatusRefusal | SessionProblem | Denied | 'invalid' | 'failed' }

/** Changes a session's status by one of the two acts; the repository checks it may. */
function statusAction(
  write: typeof cancelSession
): (externalId: unknown) => Promise<StatusOutcome> {
  return externalId =>
    asAdmin<StatusOutcome>(
      async () => {
        if (!isBoundId(externalId)) return { ok: false, reason: 'invalid' }
        const result = await write(externalId)
        return result.ok ? { ok: true } : { ok: false, reason: result.problem }
      },
      {
        denied: reason => ({ ok: false, reason }),
        failed: failedWith({ ok: false, reason: 'failed' }),
      }
    )
}

/** Cancels a session still to start; its bookings stay as the record of who was to come. */
export async function cancelSessionAction(externalId: unknown): Promise<StatusOutcome> {
  return statusAction(cancelSession)(externalId)
}

/** Plans a cancelled session again, while it is still to start and its room is free. */
export async function reinstateSessionAction(externalId: unknown): Promise<StatusOutcome> {
  return statusAction(reinstateSession)(externalId)
}
