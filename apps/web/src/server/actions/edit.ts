'use server'

import {
  createCompletion,
  createCourse,
  createEmployee,
  type RecordProblem,
  updateCompletion,
  updateCourse,
  updateEmployee,
  updateSession,
} from '@muni/db/repositories'

import { type FormState, refusedField, sessionProblem } from '@/lib/form/form'
import {
  completionSpec,
  courseCreateSpec,
  courseEditSpec,
  employeeSpec,
  parseForm,
  sessionEditSpec,
} from '@/lib/form/form-inputs'

import { isBoundId, isBoundIdOrNull, saveForm } from './guard'

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
  return saveForm(isBoundIdOrNull(code), async () => {
    let saved: Awaited<ReturnType<typeof updateCourse>>
    if (code === null) {
      const parsed = parseForm(courseCreateSpec, form)
      if (!parsed.ok) return parsed.state
      saved = await createCourse(parsed.data)
    } else {
      const parsed = parseForm(courseEditSpec, form)
      if (!parsed.ok) return parsed.state
      saved = await updateCourse(code, parsed.data)
    }
    if (!saved.ok) return refused(saved)
    return { status: 'saved', href: `/courses/${saved.code}` }
  })
}

export async function saveSession(
  externalId: string,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  return saveForm(isBoundId(externalId), async () => {
    const parsed = parseForm(sessionEditSpec, form)
    if (!parsed.ok) return parsed.state
    const result = await updateSession(externalId, parsed.data)
    if (!result.ok) return sessionProblem(result.problem)
    return { status: 'saved', href: `/sessions/${externalId}` }
  })
}

/** Saves a person (or, with `externalId` null, adds one with an app ID), then shows them. */
export async function saveEmployee(
  externalId: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  return saveForm(isBoundIdOrNull(externalId), async () => {
    const parsed = parseForm(employeeSpec, form)
    if (!parsed.ok) return parsed.state
    const saved =
      externalId === null
        ? await createEmployee(parsed.data)
        : await updateEmployee(externalId, parsed.data)
    if (!saved.ok) return refused(saved)
    return { status: 'saved', href: `/employees/${saved.externalId}` }
  })
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
  return saveForm(isBoundIdOrNull(completionId), async () => {
    const parsed = parseForm(completionSpec, form)
    if (!parsed.ok) return parsed.state
    const saved =
      completionId === null
        ? await createCompletion(parsed.data)
        : await updateCompletion(completionId, parsed.data)
    if (!saved.ok) return refused(saved)
    return { status: 'saved', href: `/employees/${saved.employeeExternalId}` }
  })
}
