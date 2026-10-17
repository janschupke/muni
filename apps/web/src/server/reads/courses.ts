import 'server-only'

import { getCourse, getCourseForEdit, listCourses, listGroupOptions } from '@muni/db/repositories'
import * as z from 'zod'

import { byCode, read } from './define'

/** The course catalogue. */
export const coursesList = read({
  guard: 'reader',
  input: z.object({}),
  load: () => listCourses(),
})

/** A course's page: requirements, compliance, sessions and recent completions. */
export const course = read({
  guard: 'reader',
  input: byCode,
  load: ({ code }) => getCourse(code),
})

/** The course form: the course (none for a new one) and the departments and positions. */
export const courseForm = read({
  guard: 'admin',
  input: byCode.partial(),
  load: async ({ code }) => {
    const [edited, departments, positions] = await Promise.all([
      code ? getCourseForEdit(code) : null,
      listGroupOptions('department'),
      listGroupOptions('position'),
    ])
    if (code && !edited) return null
    return { course: edited, departments, positions }
  },
})
