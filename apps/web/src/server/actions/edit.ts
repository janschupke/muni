'use server'

import {
  createCompletion,
  getCourseForEdit,
  updateCourse,
  updateEmployee,
  updateSession,
  type SessionWrite,
} from '@muni/db/repositories'
import {
  completionCreateSchema,
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
  list,
  number,
  sessionProblem,
  text,
  type FormState,
} from '@/lib/form'
import { requireUser } from '@/server/auth'

/** Prisma "record not found" (P2025) vs. anything else. */
function failure(error: unknown): FormState {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'P2025') return formError('not_found')
  console.error(error)
  return formError('generic')
}

export async function saveCourse(
  code: string,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireUser()
  const input = {
    name: text(form, 'name'),
    validityMonths: number(form, 'validityMonths'),
    sessionMinutes: number(form, 'sessionMinutes'),
    groupSize: number(form, 'groupSize'),
    onlineAllowed: checkbox(form, 'onlineAllowed'),
    capabilities: list(form, 'capabilities'),
  }
  const parsed = courseEditSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed.error, input)
  try {
    await updateCourse(code, parsed.data)
  } catch (error) {
    return failure(error)
  }
  revalidatePath('/', 'layout')
  redirect(`/courses/${code}`)
}

export async function saveSession(
  externalId: string,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireUser()
  const input = {
    date: text(form, 'date'),
    startTime: text(form, 'startTime'),
    endTime: text(form, 'endTime'),
    roomId: text(form, 'roomId'),
    capacity: number(form, 'capacity'),
    unnamedBookings: number(form, 'unnamedBookings') ?? 0,
    pricePerPerson: number(form, 'pricePerPerson'),
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
  redirect(`/courses/${result.courseCode}`)
}

export async function saveEmployee(
  externalId: string,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireUser()
  const input = {
    firstName: text(form, 'firstName'),
    lastName: text(form, 'lastName'),
    email: text(form, 'email')?.toLowerCase() ?? null,
    department: text(form, 'department'),
    position: text(form, 'position'),
    hiredOn: text(form, 'hiredOn'),
    leftOn: text(form, 'leftOn'),
    status: text(form, 'status'),
    note: text(form, 'note'),
  }
  const parsed = employeeEditSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed.error, input)
  try {
    await updateEmployee(externalId, parsed.data)
  } catch (error) {
    return failure(error)
  }
  revalidatePath('/', 'layout')
  redirect(`/employees/${externalId}`)
}

export async function recordCompletion(
  employeeExternalId: string,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireUser()
  const input = {
    courseCode: text(form, 'courseCode'),
    completedOn: text(form, 'completedOn'),
    validUntil: text(form, 'validUntil'),
    provider: text(form, 'provider'),
    price: number(form, 'price'),
    note: text(form, 'note'),
  }
  const parsed = completionCreateSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed.error, input)
  // Validity comes from the course on the server, never from the client.
  const course = await getCourseForEdit(parsed.data.courseCode)
  if (!course) return { status: 'error', fieldErrors: { courseCode: 'invalid_format' } }
  const months = course.validityMonths
  const validUntil =
    parsed.data.validUntil ?? (months === null ? null : addMonths(parsed.data.completedOn, months))
  try {
    await createCompletion(employeeExternalId, { ...parsed.data, validUntil })
  } catch (error) {
    return failure(error)
  }
  revalidatePath('/', 'layout')
  redirect(`/employees/${employeeExternalId}`)
}
