'use server'

import {
  createCompletion,
  createCourse,
  createEmployee,
  getCourseForEdit,
  type RecordProblem,
  type SessionWrite,
  updateCompletion,
  updateCourse,
  updateEmployee,
  updateSession,
} from '@muni/db/repositories'
import {
  completionCreateSchema,
  courseCreateSchema,
  courseEditSchema,
  employeeEditSchema,
  sessionEditSchema,
} from '@muni/domain/schemas'
import { addMonths } from '@muni/utils/dates'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  checkbox,
  fieldErrors,
  formError,
  type FormState,
  list,
  money,
  number,
  sessionProblem,
  text,
} from '@/lib/form'
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
  const key =
    problem.reason === 'taken'
      ? 'taken'
      : problem.reason === 'manager_cycle'
        ? 'manager_cycle'
        : 'unavailable'
  return { status: 'error', fieldErrors: { [problem.field]: key } }
}

const courseInput = (form: FormData) => ({
  name: text(form, 'name'),
  validityMonths: number(form, 'validityMonths'),
  requiredForAll: checkbox(form, 'requiredForAll'),
  departmentIds: list(form, 'departmentIds'),
  positionIds: list(form, 'positionIds'),
  sessionMinutes: number(form, 'sessionMinutes'),
  groupSize: number(form, 'groupSize'),
  onlineAllowed: checkbox(form, 'onlineAllowed'),
  capabilities: list(form, 'capabilities'),
})

/** Saves a course (or, with `code` null, creates one from the posted code), then shows it. */
export async function saveCourse(
  code: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  let saved: Awaited<ReturnType<typeof updateCourse>>
  if (code === null) {
    const input = { ...courseInput(form), code: text(form, 'code')?.toUpperCase() ?? null }
    const parsed = courseCreateSchema.safeParse(input)
    if (!parsed.success) return fieldErrors(parsed.error, input)
    try {
      saved = await createCourse(parsed.data)
    } catch (error) {
      return failure(error)
    }
  } else {
    const input = courseInput(form)
    const parsed = courseEditSchema.safeParse(input)
    if (!parsed.success) return fieldErrors(parsed.error, input)
    try {
      saved = await updateCourse(code, parsed.data)
    } catch (error) {
      return failure(error)
    }
  }
  if (!saved.ok) return refused(saved)
  revalidatePath('/', 'layout')
  redirect(`/courses/${saved.code}`)
}

export async function saveSession(
  externalId: string,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const input = {
    date: text(form, 'date'),
    startTime: text(form, 'startTime'),
    endTime: text(form, 'endTime'),
    roomId: text(form, 'roomId'),
    capacity: number(form, 'capacity'),
    unnamedBookings: number(form, 'unnamedBookings') ?? 0,
    pricePerPerson: money(form, 'pricePerPerson'),
    status: text(form, 'status'),
  }
  const parsed = sessionEditSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed.error, input)
  let result: SessionWrite
  try {
    result = await updateSession(externalId, parsed.data)
  } catch (error) {
    return failure(error)
  }
  if (!result.ok) return sessionProblem(result.problem)
  revalidatePath('/', 'layout')
  redirect(`/sessions/${externalId}`)
}

/** Saves a person (or, with `externalId` null, adds one with an app ID), then shows them. */
export async function saveEmployee(
  externalId: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const input = {
    firstName: text(form, 'firstName'),
    lastName: text(form, 'lastName'),
    email: text(form, 'email')?.toLowerCase() ?? null,
    nationalId: text(form, 'nationalId'),
    departmentId: text(form, 'departmentId'),
    positionId: text(form, 'positionId'),
    managerExternalId: text(form, 'managerExternalId'),
    hiredOn: text(form, 'hiredOn'),
    leftOn: text(form, 'leftOn'),
    status: text(form, 'status'),
    note: text(form, 'note'),
  }
  const parsed = employeeEditSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed.error, input)
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
  revalidatePath('/', 'layout')
  redirect(`/employees/${saved.externalId}`)
}

const completionInput = (form: FormData) => ({
  courseCode: text(form, 'courseCode'),
  completedOn: text(form, 'completedOn'),
  validUntil: text(form, 'validUntil'),
  provider: text(form, 'provider'),
  price: money(form, 'price'),
  note: text(form, 'note'),
})

/**
 * Records a completion (`completionId` null) or corrects one, then shows the person. An empty
 * validity is worked out from the course on the server, never taken from the client.
 */
export async function saveCompletion(
  employeeExternalId: string,
  completionId: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const input = completionInput(form)
  const parsed = completionCreateSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed.error, input)
  const course = await getCourseForEdit(parsed.data.courseCode)
  if (!course) return { status: 'error', fieldErrors: { courseCode: 'unavailable' } }
  const months = course.validityMonths
  const validUntil =
    parsed.data.validUntil ?? (months === null ? null : addMonths(parsed.data.completedOn, months))
  try {
    if (completionId === null)
      await createCompletion(employeeExternalId, { ...parsed.data, validUntil })
    else await updateCompletion(completionId, { ...parsed.data, validUntil })
  } catch (error) {
    return failure(error)
  }
  revalidatePath('/', 'layout')
  redirect(`/employees/${employeeExternalId}`)
}
