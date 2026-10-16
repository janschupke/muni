'use server'

import { createSession, type SessionProblem, type SessionWrite } from '@muni/db/repositories'
import { sessionCreateSchema, type SessionCreate } from '@muni/domain/schemas'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { fieldErrors, formError, number, sessionProblem, text, type FormState } from '@/lib/form'
import { getViewer, requireUser } from '@/server/auth'

export type CreateOutcome =
  | { ok: true; externalId: string }
  | { ok: false; reason: 'unauthorized' | 'invalid' | 'failed' | SessionProblem }

/**
 * Creates the session a planner offer describes; the planner stays open for the next one.
 * Every way it can fail comes back as a reason the planner shows next to the offer.
 */
export async function createOfferedSession(input: SessionCreate): Promise<CreateOutcome> {
  // Signed out meanwhile (an expired session): say so, rather than throwing into the page.
  if ((await getViewer()) !== 'authenticated') return { ok: false, reason: 'unauthorized' }
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

/** The course page's "new session" form; opens the new session. */
export async function saveNewSession(
  courseCode: string,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireUser()
  const input = {
    courseCode,
    date: text(form, 'date'),
    startTime: text(form, 'startTime'),
    endTime: text(form, 'endTime'),
    roomId: text(form, 'roomId'),
    capacity: number(form, 'capacity'),
    pricePerPerson: number(form, 'pricePerPerson'),
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
