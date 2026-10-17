'use server'

import {
  applyAssignments,
  type AssignmentFailure,
  type MoveFailure,
  moveSeatsMany,
  raiseCapacity,
  type RaiseProblem,
  removeAssignment,
} from '@muni/db/repositories'
import { bookingSchema } from '@muni/domain/schemas'
import * as z from 'zod'

import { asAdmin, type Denied, logFailure } from './guard'

const externalId = z.string().trim().min(1).max(32)
const applyInput = z
  .array(
    z.object({
      sessionExternalId: externalId,
      employeeExternalId: externalId,
      source: z.enum(['ADVISOR', 'MANUAL']),
    })
  )
  .min(1)
  .max(500)

export type ApplyResult =
  | {
      ok: true
      applied: number
      /** Refused pairs with the reason; the rest were saved. */
      failed: { sessionExternalId: string; employeeExternalId: string; reason: AssignmentFailure }[]
    }
  /** Nothing was saved: turned away, a request that does not parse, or the write failed. */
  | { ok: false; problem: Denied | 'invalid' | 'failed' }

const failedWith =
  <T>(answer: T) =>
  (error: unknown): T => {
    logFailure(error)
    return answer
  }

/**
 * Saves bookings (the advisor's, or picked on a record's page). Each pair is re-checked on the
 * server against the locked session row: seats, status, clashes, and whether the training is
 * still due.
 */
export async function applyAssignmentsAction(input: unknown): Promise<ApplyResult> {
  return asAdmin<ApplyResult>(
    async admin => {
      const requests = applyInput.safeParse(input)
      if (!requests.success) return { ok: false, problem: 'invalid' }
      const outcomes = await applyAssignments(requests.data, admin.id)
      return {
        ok: true,
        applied: outcomes.filter(o => o.ok).length,
        failed: outcomes.flatMap(o =>
          o.ok
            ? []
            : [
                {
                  sessionExternalId: o.request.sessionExternalId,
                  employeeExternalId: o.request.employeeExternalId,
                  reason: o.reason,
                },
              ]
        ),
      }
    },
    {
      denied: problem => ({ ok: false, problem }),
      failed: failedWith({ ok: false, problem: 'failed' }),
    }
  )
}

/** What booking someone by hand says: done, or why not (the same reasons as the advisor's). */
export type BookingState =
  | { status: 'idle' }
  | { status: 'done' }
  | { status: 'refused'; reason: AssignmentFailure | Denied | 'invalid' | 'failed' }

/**
 * Books one person on one session by hand, from the session's page. Every rule is checked on
 * the server, as for every booking (whether the training is still due included).
 */
export async function addBookingAction(
  sessionExternalId: string,
  _state: BookingState,
  form: FormData
): Promise<BookingState> {
  return asAdmin<BookingState>(
    async admin => {
      const parsed = bookingSchema.safeParse({
        sessionExternalId,
        employeeExternalId: form.get('employeeExternalId'),
      })
      if (!parsed.success) return { status: 'refused', reason: 'invalid' }
      const [outcome] = await applyAssignments([{ ...parsed.data, source: 'MANUAL' }], admin.id)
      if (!outcome) return { status: 'refused', reason: 'failed' }
      return outcome.ok ? { status: 'done' } : { status: 'refused', reason: outcome.reason }
    },
    {
      denied: reason => ({ status: 'refused', reason }),
      failed: failedWith({ status: 'refused', reason: 'failed' }),
    }
  )
}

/** What cancelling a booking came to: done, already gone, or why not. */
export type RemoveOutcome =
  { ok: true } | { ok: false; reason: 'gone' | Denied | 'invalid' | 'failed' }

export async function removeAssignmentAction(input: unknown): Promise<RemoveOutcome> {
  return asAdmin<RemoveOutcome>(
    async () => {
      const parsed = bookingSchema.safeParse(input)
      if (!parsed.success) return { ok: false, reason: 'invalid' }
      const { sessionExternalId, employeeExternalId } = parsed.data
      return (await removeAssignment(sessionExternalId, employeeExternalId))
        ? { ok: true }
        : { ok: false, reason: 'gone' }
    },
    {
      denied: reason => ({ ok: false, reason }),
      failed: failedWith({ ok: false, reason: 'failed' }),
    }
  )
}

const resolveInput = z.object({
  from: externalId,
  resolution: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('move'),
      moves: z
        .array(z.object({ to: externalId, count: z.int().min(1).max(10_000) }))
        .min(1)
        .max(50),
    }),
    z.object({ kind: z.literal('raise'), capacity: z.int().min(1).max(10_000) }),
  ]),
})

/** What resolving an overbooked session came to. */
export type ResolveOutcome =
  | { ok: true }
  | { ok: false; reason: MoveFailure | RaiseProblem | Denied | 'invalid' | 'failed'; to?: string }

/**
 * Resolves an overbooked session the way the admin chose, in one transaction: anonymous seats
 * moved to the sessions picked (all of them or none), or the capacity raised to fit everyone
 * when the room has the seats.
 */
export async function resolveOverbookingAction(input: unknown): Promise<ResolveOutcome> {
  return asAdmin<ResolveOutcome>(
    async () => {
      const parsed = resolveInput.safeParse(input)
      if (!parsed.success) return { ok: false, reason: 'invalid' }
      const { from, resolution } = parsed.data
      if (resolution.kind === 'raise') {
        const raised = await raiseCapacity(from, resolution.capacity)
        return raised.ok ? { ok: true } : { ok: false, reason: raised.problem }
      }
      const moved = await moveSeatsMany(from, resolution.moves)
      return moved.ok
        ? { ok: true }
        : { ok: false, reason: moved.reason, ...(moved.to && { to: moved.to }) }
    },
    {
      denied: reason => ({ ok: false, reason }),
      failed: failedWith({ ok: false, reason: 'failed' }),
    }
  )
}
