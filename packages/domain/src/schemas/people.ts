import * as z from 'zod'

import { EMPLOYMENT_STATUSES } from '../enums'
import { entityId, entityIds, externalIdSchema, isoDate, optionalText, trimmed } from './fields'

export const employeeSchema = z
  .object({
    externalId: externalIdSchema,
    firstName: trimmed(100),
    lastName: trimmed(100),
    email: z.email().max(254).nullable(),
    nationalId: z
      .string()
      .regex(/^\d{6}\/?\d{3,4}$/)
      .nullable(),
    department: optionalText(120),
    position: optionalText(120),
    managerEmail: z.email().max(254).nullable(),
    hiredOn: isoDate,
    leftOn: isoDate.nullable(),
    status: z.enum(EMPLOYMENT_STATUSES),
    note: optionalText(2000),
  })
  .refine(e => e.leftOn === null || e.leftOn >= e.hiredOn, {
    path: ['leftOn'],
    error: 'before_hired',
  })
export type EmployeeInput = z.infer<typeof employeeSchema>

/** What the app edits of a person; a new person gets an `N`-prefixed ID. */
export const employeeEditSchema = z
  .object({
    firstName: trimmed(100),
    lastName: trimmed(100),
    email: z.email().max(254).nullable(),
    nationalId: z
      .string()
      .regex(/^\d{6}\/?\d{3,4}$/)
      .nullable(),
    departmentId: entityId.nullable(),
    /** One of the positions the department has. */
    positionId: entityId.nullable(),
    /** Someone else, and not anyone the person manages (directly or further down). */
    managerId: entityId.nullable(),
    /** Leads their department (which then needs to be set). */
    leadsDepartment: z.boolean(),
    hiredOn: isoDate,
    leftOn: isoDate.nullable(),
    status: z.enum(EMPLOYMENT_STATUSES),
    note: optionalText(2000),
  })
  .refine(e => e.leftOn === null || e.leftOn >= e.hiredOn, {
    path: ['leftOn'],
    error: 'before_hired',
  })
  .refine(e => !e.leadsDepartment || e.departmentId !== null, {
    path: ['leadsDepartment'],
    error: 'no_department',
  })
export type EmployeeEdit = z.infer<typeof employeeEditSchema>

/** A department: its name and who leads it (one of its members). */
export const departmentSchema = z.object({ name: trimmed(120), headId: entityId.nullable() })
export type DepartmentInput = z.infer<typeof departmentSchema>

/** A position: its name and the departments it exists in. */
export const positionSchema = z.object({ name: trimmed(120), departmentIds: entityIds })
export type PositionInput = z.infer<typeof positionSchema>
