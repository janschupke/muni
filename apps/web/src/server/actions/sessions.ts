'use server'

import { createSession, type SessionProblem, type SessionWrite } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { type SessionCreate, sessionCreateSchema } from '@muni/domain/schemas'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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
 * The "new session" form, from a course's page (`courseCode` fixed) or the sessions list
 * (the course is chosen in the form); opens the new session.
 */
export async function saveNewSession(
  courseCode: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const input = {
    courseCode: courseCode ?? text(form, 'courseCode'),
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
