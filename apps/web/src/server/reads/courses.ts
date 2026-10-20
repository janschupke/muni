import 'server-only'

import {
  getCourse,
  getCourseForEdit,
  listCourses,
  listGroupOptions,
  pageOf,
} from '@muni/db/repositories'
import * as z from 'zod'

import { COMPLETION_SORT, COURSE_SORT, SESSION_SORT } from '@/lib/list/list-keys'
import { listQuery } from '@/lib/list/search-params'

import { byCode, listInput, read } from './core/define'
import { completionKeys, courseKeys, sessionKeys } from './core/sorters'

/** The course catalogue: one page, sorted by the column asked for (by code without one). */
export const coursesList = read({
  guard: 'reader',
  input: z.object(listInput(COURSE_SORT)),
  load: async input => pageOf(await listCourses(), listQuery(input, COURSE_SORT), courseKeys),
})

/**
 * A course's page: requirements, compliance, and a page each of its sessions ahead
 * (`sessionsSort`…) and its completions (`completionsSort`…), sorted on the server.
 */
export const course = read({
  guard: 'reader',
  input: byCode.extend({
    ...listInput(SESSION_SORT, 'sessions'),
    ...listInput(COMPLETION_SORT, 'completions'),
  }),
  load: async ({ code, ...lists }) => {
    const found = await getCourse(code)
    return (
      found && {
        ...found,
        sessions: pageOf(found.sessions, listQuery(lists, SESSION_SORT, 'sessions'), sessionKeys),
        completionList: pageOf(
          found.completionList,
          listQuery(lists, COMPLETION_SORT, 'completions'),
          completionKeys
        ),
      }
    )
  },
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
