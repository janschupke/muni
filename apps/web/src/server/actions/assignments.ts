'use server'

import {
  applyAssignments,
  type AssignmentFailure,
  type MoveFailure,
  moveSeats,
  removeAssignment,
} from '@muni/db/repositories'
import { bookingSchema } from '@muni/domain/schemas'
import { revalidatePath } from 'next/cache'
import * as z from 'zod'

import { requireAdmin } from '@/server/auth'

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

export interface ApplyResult {
  applied: number
  /** Refused pairs with the reason; the rest were saved. */
  failed: { sessionExternalId: string; employeeExternalId: string; reason: AssignmentFailure }[]
}

/**
 * Saves advisor (or manual) bookings. Each pair is re-checked on the server against the locked
 * session row: seats, status, clashes and, for advisor pairs, whether the training is still due.
 */
export async function applyAssignmentsAction(input: unknown): Promise<ApplyResult> {
  const user = await requireAdmin()
  const requests = applyInput.parse(input)
  const outcomes = await applyAssignments(requests, user.id)
  revalidatePath('/', 'layout')
  return {
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
}

/** What booking someone by hand says: done, or why not (the same reasons as the advisor's). */
export type BookingState =
  | { status: 'idle' }
  | { status: 'done' }
  | { status: 'refused'; reason: AssignmentFailure | 'invalid' }

/**
 * Books one person on one session by hand (the session page adds a person, a person's page
 * adds a session). Every rule is checked on the server, as for the advisor's bookings.
 */
export async function addBookingAction(
  fixed: { sessionExternalId?: string; employeeExternalId?: string },
  _state: BookingState,
  form: FormData
): Promise<BookingState> {
  const user = await requireAdmin()
  const parsed = bookingSchema.safeParse({
    sessionExternalId: fixed.sessionExternalId ?? form.get('sessionExternalId'),
    employeeExternalId: fixed.employeeExternalId ?? form.get('employeeExternalId'),
  })
  if (!parsed.success) return { status: 'refused', reason: 'invalid' }
  const [outcome] = await applyAssignments([{ ...parsed.data, source: 'MANUAL' }], user.id)
  revalidatePath('/', 'layout')
  return !outcome || outcome.ok ? { status: 'done' } : { status: 'refused', reason: outcome.reason }
}

export async function removeAssignmentAction(input: unknown): Promise<boolean> {
  await requireAdmin()
  const { sessionExternalId, employeeExternalId } = bookingSchema.parse(input)
  const removed = await removeAssignment(sessionExternalId, employeeExternalId)
  revalidatePath('/', 'layout')
  return removed
}

export async function moveSeatsAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; reason: MoveFailure }> {
  await requireAdmin()
  const { from, to, count } = z
    .object({ from: externalId, to: externalId, count: z.int().min(1).max(10_000) })
    .parse(input)
  const result = await moveSeats(from, to, count)
  revalidatePath('/', 'layout')
  return result
}
