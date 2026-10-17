'use server'

import {
  createCompletion,
  createCourse,
  createEmployee,
  type RecordProblem,
  type SessionWrite,
  updateCompletion,
  updateCourse,
  updateEmployee,
  updateSession,
} from '@muni/db/repositories'

import { formError, type FormState, refusedField, sessionProblem } from '@/lib/form'
import {
  completionSpec,
  courseCreateSpec,
  courseEditSpec,
  employeeSpec,
  parseForm,
  sessionEditSpec,
} from '@/lib/form-inputs'
import { requireAdmin } from '@/server/auth'

/** Prisma "record not found" (P2025) vs. anything else. */
function failure(error: unknown): FormState {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'P2025') return formError('not_found')
  console.error(error)
  return formError('generic')
}

/** A refused write, on the field to change. */
function refused(problem: RecordProblem): FormState {
  switch (problem.reason) {
    case 'not_found':
      return refusedField(problem.field, 'unavailable')
    case 'sessions_unfit':
      return refusedField(problem.field, 'sessions_unfit', { count: problem.count })
    default:
      return refusedField(problem.field, problem.reason)
  }
}

/** Saves a course (or, with `code` null, creates one from the posted code), then shows it. */
export async function saveCourse(
  code: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  let saved: Awaited<ReturnType<typeof updateCourse>>
  if (code === null) {
    const parsed = parseForm(courseCreateSpec, form)
    if (!parsed.ok) return parsed.state
    try {
      saved = await createCourse(parsed.data)
    } catch (error) {
      return failure(error)
    }
  } else {
    const parsed = parseForm(courseEditSpec, form)
    if (!parsed.ok) return parsed.state
    try {
      saved = await updateCourse(code, parsed.data)
    } catch (error) {
      return failure(error)
    }
  }
  if (!saved.ok) return refused(saved)
  return { status: 'saved', href: `/courses/${saved.code}` }
}

export async function saveSession(
  externalId: string,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const parsed = parseForm(sessionEditSpec, form)
  if (!parsed.ok) return parsed.state
  let result: SessionWrite
  try {
    result = await updateSession(externalId, parsed.data)
  } catch (error) {
    return failure(error)
  }
  if (!result.ok) return sessionProblem(result.problem)
  return { status: 'saved', href: `/sessions/${externalId}` }
}

/** Saves a person (or, with `externalId` null, adds one with an app ID), then shows them. */
export async function saveEmployee(
  externalId: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const parsed = parseForm(employeeSpec, form)
  if (!parsed.ok) return parsed.state
  let saved: Awaited<ReturnType<typeof updateEmployee>>
  try {
    saved =
      externalId === null
        ? await createEmployee(parsed.data)
        : await updateEmployee(externalId, parsed.data)
  } catch (error) {
    return failure(error)
  }
  if (!saved.ok) return refused(saved)
  return { status: 'saved', href: `/employees/${saved.externalId}` }
}

/**
 * Records a completion (`completionId` null) or corrects one, then shows its person. An empty
 * validity is worked out from the course on the server, never taken from the client.
 */
export async function saveCompletion(
  completionId: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const parsed = parseForm(completionSpec, form)
  if (!parsed.ok) return parsed.state
  let saved: Awaited<ReturnType<typeof createCompletion>>
  try {
    saved =
      completionId === null
        ? await createCompletion(parsed.data)
        : await updateCompletion(completionId, parsed.data)
  } catch (error) {
    return failure(error)
  }
  if (!saved.ok) return refused(saved)
  return { status: 'saved', href: `/employees/${saved.employeeExternalId}` }
}
