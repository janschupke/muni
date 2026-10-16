import {
  completionCreateSchema,
  courseEditSchema,
  employeeEditSchema,
  sessionEditSchema,
  type CompletionCreate,
  type CourseEdit,
  type EmployeeEdit,
  type SessionEdit,
} from '@muni/domain/schemas'
import { isoDateToUtc, zonedTimeToUtc } from '@muni/utils/dates'
import { cleanFreeText } from '@muni/utils/text'

import { dbOf, type RepoOptions } from './context'

// Mutations. Callers (server actions) must have verified a signed-in user first;
// the input is re-parsed here regardless of what the caller validated.

export async function updateCourse(code: string, input: CourseEdit, options?: RepoOptions) {
  const data = courseEditSchema.parse(input)
  return dbOf(options).course.update({
    where: { code },
    data: { name: data.name, validityMonths: data.validityMonths },
    select: { code: true },
  })
}

export async function updateSession(externalId: string, input: SessionEdit, options?: RepoOptions) {
  const data = sessionEditSchema.parse(input)
  return dbOf(options).courseSession.update({
    where: { externalId },
    data: {
      startsAt: zonedTimeToUtc(data.date, data.startTime),
      endsAt: zonedTimeToUtc(data.date, data.endTime),
      location: data.location,
      isOnline: data.isOnline,
      capacity: data.capacity,
      unnamedBookings: data.unnamedBookings,
      pricePerPerson: data.pricePerPerson,
      status: data.status,
    },
    select: { externalId: true, course: { select: { code: true } } },
  })
}

async function nameId(
  options: RepoOptions | undefined,
  model: 'department' | 'position',
  name: string | null
): Promise<string | null> {
  if (!name) return null
  const db = dbOf(options)
  const row =
    model === 'department'
      ? await db.department.upsert({
          where: { name },
          create: { name },
          update: {},
          select: { id: true },
        })
      : await db.position.upsert({
          where: { name },
          create: { name },
          update: {},
          select: { id: true },
        })
  return row.id
}

export async function updateEmployee(
  externalId: string,
  input: EmployeeEdit,
  options?: RepoOptions
) {
  const data = employeeEditSchema.parse(input)
  return dbOf(options).employee.update({
    where: { externalId },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      departmentId: await nameId(options, 'department', data.department),
      positionId: await nameId(options, 'position', data.position),
      hiredOn: isoDateToUtc(data.hiredOn),
      leftOn: data.leftOn ? isoDateToUtc(data.leftOn) : null,
      status: data.status,
      note: cleanFreeText(data.note),
    },
    select: { externalId: true },
  })
}

/** Records a completion entered in the app. Its ID gets an `A` prefix to keep clear of imports. */
export async function createCompletion(
  employeeExternalId: string,
  input: CompletionCreate,
  options?: RepoOptions
) {
  const data = completionCreateSchema.parse(input)
  const db = dbOf(options)
  const [employee, course] = await Promise.all([
    db.employee.findUniqueOrThrow({
      where: { externalId: employeeExternalId },
      select: { id: true },
    }),
    db.course.findUniqueOrThrow({ where: { code: data.courseCode }, select: { id: true } }),
  ])
  const provider = data.provider
    ? await db.provider.upsert({
        where: { name: data.provider },
        create: { name: data.provider },
        update: {},
        select: { id: true },
      })
    : null
  return db.courseCompletion.create({
    data: {
      externalId: `A${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`.toUpperCase(),
      employeeId: employee.id,
      courseId: course.id,
      completedOn: isoDateToUtc(data.completedOn),
      validUntil: data.validUntil ? isoDateToUtc(data.validUntil) : null,
      providerId: provider?.id ?? null,
      price: data.price,
      note: cleanFreeText(data.note),
    },
    select: { externalId: true },
  })
}
