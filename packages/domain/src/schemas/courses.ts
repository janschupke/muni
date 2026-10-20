import * as z from 'zod'

import { SESSION_MINUTES } from '../sessions'
import { capabilities, courseCodeSchema, entityIds, trimmed } from './fields'

const requirementSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('ALL') }),
  z.object({ scope: z.literal('DEPARTMENT'), department: trimmed(120) }),
  z.object({ scope: z.literal('POSITION'), position: trimmed(120) }),
])
export type RequirementInput = z.infer<typeof requirementSchema>

export const courseSchema = z.object({
  code: courseCodeSchema,
  name: trimmed(200),
  /** null = never expires (one-off course or optional course). */
  validityMonths: z.int().min(1).max(240).nullable(),
  requirements: z.array(requirementSchema).max(50),
})
export type CourseInput = z.infer<typeof courseSchema>

export const courseEditSchema = courseSchema.pick({ name: true, validityMonths: true }).extend({
  /** Who must hold it: everyone, and/or these departments and positions; none = optional. */
  requiredForAll: z.boolean(),
  departmentIds: entityIds,
  positionIds: entityIds,
  /**
   * What every session of the course is: its length (null = not set yet, nothing can be
   * scheduled; at most 12 hours), its seats unless a session sets its own, whether it may be
   * held online, and the equipment its room needs.
   */
  sessionMinutes: z.int().min(SESSION_MINUTES.min).max(SESSION_MINUTES.max).nullable(),
  seats: z.int().min(1).max(10_000).nullable(),
  onlineAllowed: z.boolean(),
  capabilities,
})
export type CourseEdit = z.infer<typeof courseEditSchema>

export const courseCreateSchema = courseEditSchema.extend({ code: courseCodeSchema })
export type CourseCreate = z.infer<typeof courseCreateSchema>
