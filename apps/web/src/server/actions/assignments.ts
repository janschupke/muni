'use server'

import {
  applyAssignments,
  moveSeats,
  removeAssignment,
  type AssignmentFailure,
  type MoveFailure,
} from '@muni/db/repositories'
import { revalidatePath } from 'next/cache'
import * as z from 'zod'

import { requireUser } from '@/server/auth'

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
  const userId = await requireUser()
  const requests = applyInput.parse(input)
  const outcomes = await applyAssignments(requests, userId)
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

export async function removeAssignmentAction(input: unknown): Promise<boolean> {
  await requireUser()
  const { sessionExternalId, employeeExternalId } = z
    .object({ sessionExternalId: externalId, employeeExternalId: externalId })
    .parse(input)
  const removed = await removeAssignment(sessionExternalId, employeeExternalId)
  revalidatePath('/', 'layout')
  return removed
}

export async function moveSeatsAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; reason: MoveFailure }> {
  await requireUser()
  const { from, to, count } = z
    .object({ from: externalId, to: externalId, count: z.int().min(1).max(10_000) })
    .parse(input)
  const result = await moveSeats(from, to, count)
  revalidatePath('/', 'layout')
  return result
}
