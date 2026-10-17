'use server'

import {
  checkSessionSlot,
  createSession,
  type SessionProblem,
  type SessionWrite,
} from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { type SessionCreate, sessionCreateSchema } from '@muni/domain/schemas'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import * as z from 'zod'

import {
  fieldErrors,
  formError,
  type FormState,
  money,
  number,
  sessionProblem,
  text,
} from '@/lib/form'
import { getSessionUser, requireAdmin } from '@/server/auth'

export type CreateOutcome =
  | { ok: true; externalId: string }
  | { ok: false; reason: 'unauthorized' | 'invalid' | 'failed' | SessionProblem }

/**
 * Creates the session a planner offer describes; the planner stays open for the next one.
 * Every way it can fail comes back as a reason the planner shows next to the offer.
 */
export async function createOfferedSession(input: SessionCreate): Promise<CreateOutcome> {
  // Signed out meanwhile (an expired session) or no longer an admin: say so, rather than
  // throwing into the page.
  const user = await getSessionUser()
  if (!user || !canWrite(user.role)) return { ok: false, reason: 'unauthorized' }
  const parsed = sessionCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid' }
  try {
    const result = await createSession(parsed.data)
    if (!result.ok) return { ok: false, reason: result.problem }
    revalidatePath('/', 'layout')
    return { ok: true, externalId: result.externalId }
  } catch (error) {
    console.error(error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * The "new session" form, from a course's page (that course chosen to start with) or the
 * sessions list; opens the new session.
 */
export async function saveNewSession(_state: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()
  const input = {
    courseId: text(form, 'courseId'),
    date: text(form, 'date'),
    startTime: text(form, 'startTime'),
    endTime: text(form, 'endTime'),
    roomId: text(form, 'roomId'),
    capacity: number(form, 'capacity'),
    pricePerPerson: money(form, 'pricePerPerson'),
    status: text(form, 'status'),
  }
  const parsed = sessionCreateSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed.error, input)
  let result: SessionWrite
  try {
    result = await createSession(parsed.data)
  } catch (error) {
    console.error(error)
    return formError('generic')
  }
  if (!result.ok) return sessionProblem(result.problem)
  revalidatePath('/', 'layout')
  redirect(`/sessions/${result.externalId}`)
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
