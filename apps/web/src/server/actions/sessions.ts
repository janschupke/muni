'use server'

import { createSession } from '@muni/db/repositories'
import { sessionCreateSchema, type SessionCreate } from '@muni/domain/schemas'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { fieldErrors, formError, number, text, type FormState } from '@/lib/form'
import { requireUser } from '@/server/auth'

export type CreateOutcome = { ok: true; externalId: string } | { ok: false }

/** Creates the session a planner offer describes; the planner stays open for the next one. */
export async function createOfferedSession(input: SessionCreate): Promise<CreateOutcome> {
  await requireUser()
  const parsed = sessionCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false }
  try {
    const { externalId } = await createSession(parsed.data)
    revalidatePath('/', 'layout')
    return { ok: true, externalId }
  } catch (error) {
    console.error(error)
    return { ok: false }
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
  let externalId: string
  try {
    externalId = (await createSession(parsed.data)).externalId
  } catch (error) {
    console.error(error)
    return formError('generic')
  }
  revalidatePath('/', 'layout')
  redirect(`/sessions/${externalId}`)
}
