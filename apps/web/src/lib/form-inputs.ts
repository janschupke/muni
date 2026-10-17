import {
  completionEditSchema,
  courseCreateSchema,
  courseEditSchema,
  departmentSchema,
  employeeEditSchema,
  positionSchema,
  providerSchema,
  roomSchema,
  sessionCreateSchema,
  sessionEditSchema,
} from '@muni/domain/schemas'
import type * as z from 'zod'

import {
  checkbox,
  fieldErrors,
  type FormState,
  list,
  money,
  NEW_PROVIDER,
  number,
  text,
} from './form'

// What each form posts, read into the shape its schema checks. The browser runs these on
// every change to show errors as the user types; the server action runs the same ones on
// save, so the two can never disagree about what is valid.

/** A form's reader and the schema it is checked against. */
export interface FormSpec<T = unknown> {
  read: (form: FormData) => Record<string, unknown>
  schema: z.ZodType<T>
}

const spec = <T>(read: FormSpec<T>['read'], schema: z.ZodType<T>): FormSpec<T> => ({
  read,
  schema,
})

/** Reads and checks a form: its data, or the errors to show (as a form state). */
export function parseForm<T>(
  { read, schema }: FormSpec<T>,
  form: FormData
): { ok: true; data: T } | { ok: false; state: FormState } {
  const input = read(form)
  const parsed = schema.safeParse(input)
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, state: fieldErrors(parsed.error, input) }
}

/** A three-way choice posted as `derived`, `yes` or `no`: null = take the derived value. */
function override(form: FormData, key: string): boolean | null {
  const value = text(form, key)
  return value === 'yes' ? true : value === 'no' ? false : null
}

const courseInput = (form: FormData) => ({
  name: text(form, 'name'),
  validityMonths: number(form, 'validityMonths'),
  requiredForAll: checkbox(form, 'requiredForAll'),
  departmentIds: list(form, 'departmentIds'),
  positionIds: list(form, 'positionIds'),
  sessionMinutes: number(form, 'sessionMinutes'),
  groupSize: number(form, 'groupSize'),
  onlineAllowed: override(form, 'onlineAllowed'),
  capabilities: list(form, 'capabilities'),
})

export const courseEditSpec = spec(courseInput, courseEditSchema)

/** A new course also takes its code, read in capitals. */
export const courseCreateSpec = spec(
  form => ({ ...courseInput(form), code: text(form, 'code')?.toUpperCase() ?? null }),
  courseCreateSchema
)

const sessionInput = (form: FormData) => ({
  courseId: text(form, 'courseId'),
  date: text(form, 'date'),
  startTime: text(form, 'startTime'),
  endTime: text(form, 'endTime'),
  roomId: text(form, 'roomId'),
  capacity: number(form, 'capacity'),
  pricePerPerson: money(form, 'pricePerPerson'),
})

export const sessionEditSpec = spec(
  form => ({ ...sessionInput(form), unnamedBookings: number(form, 'unnamedBookings') ?? 0 }),
  sessionEditSchema
)

export const sessionCreateSpec = spec(sessionInput, sessionCreateSchema)

export const employeeSpec = spec(
  form => ({
    firstName: text(form, 'firstName'),
    lastName: text(form, 'lastName'),
    email: text(form, 'email')?.toLowerCase() ?? null,
    nationalId: text(form, 'nationalId'),
    departmentId: text(form, 'departmentId'),
    positionId: text(form, 'positionId'),
    managerId: text(form, 'managerId'),
    leadsDepartment: checkbox(form, 'leadsDepartment'),
    hiredOn: text(form, 'hiredOn'),
    leftOn: text(form, 'leftOn'),
    status: text(form, 'status'),
    note: text(form, 'note'),
  }),
  employeeEditSchema
)

/**
 * A completion. "New provider…" with no name posts an empty name, which the schema refuses
 * as missing; any other choice posts no name at all.
 */
export const completionSpec = spec(
  form => {
    const provider = text(form, 'providerId')
    const isNew = provider === NEW_PROVIDER
    return {
      employeeId: text(form, 'employeeId'),
      courseId: text(form, 'courseId'),
      completedOn: text(form, 'completedOn'),
      validUntil: text(form, 'validUntil'),
      providerId: isNew ? null : provider,
      newProviderName: isNew ? (text(form, 'newProviderName') ?? '') : null,
      price: money(form, 'price'),
      note: text(form, 'note'),
    }
  },
  completionEditSchema.refine(c => c.newProviderName !== '', {
    path: ['newProviderName'],
    error: 'required',
  })
)

export const providerSpec = spec(
  form => ({
    name: text(form, 'name'),
    companyId: text(form, 'companyId'),
    email: text(form, 'email'),
    phone: text(form, 'phone'),
    website: text(form, 'website'),
    note: text(form, 'note'),
  }),
  providerSchema
)

export const roomSpec = spec(
  form => ({
    name: text(form, 'name'),
    kind: text(form, 'kind'),
    capacity: number(form, 'capacity'),
    capabilities: list(form, 'capabilities'),
    note: text(form, 'note'),
  }),
  roomSchema
)

export const departmentSpec = spec(
  form => ({ name: text(form, 'name'), headId: text(form, 'headId') }),
  departmentSchema
)

export const positionSpec = spec(
  form => ({ name: text(form, 'name'), departmentIds: list(form, 'departmentIds') }),
  positionSchema
)
