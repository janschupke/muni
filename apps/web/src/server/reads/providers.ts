import 'server-only'

import {
  getProvider,
  getProviderForEdit,
  listCourseOptions,
  listProviders,
  pageOf,
} from '@muni/db/repositories'
import * as z from 'zod'

import {
  COMPLETION_SORT,
  PROVIDER_COURSE_SORT,
  PROVIDER_SORT,
  SESSION_SORT,
} from '@/lib/list/list-keys'
import { listQuery } from '@/lib/list/search-params'

import { byId, listInput, read } from './core/define'
import { completionKeys, providerCourseKeys, providerKeys, sessionKeys } from './core/sorters'

// Providers, rooms and users: plain lists, a page each sorted on the server, and the forms.
/** Providers, a page at a time; prices only for the roles that may see them. */
export const providersList = read({
  guard: 'reader',
  input: z.object(listInput(PROVIDER_SORT)),
  load: async (input, user) => {
    const { providers, prices } = await listProviders(user.role)
    return {
      prices,
      providers: pageOf(providers, listQuery(input, PROVIDER_SORT), providerKeys),
    }
  },
})

/**
 * A provider's page, as the role may see it: a page each of its sessions ahead
 * (`sessionsSort`…), its courses (`coursesSort`…) and its completions (`completionsSort`…),
 * sorted on the server.
 */
export const provider = read({
  guard: 'reader',
  input: byId.extend({
    ...listInput(SESSION_SORT, 'sessions'),
    ...listInput(PROVIDER_COURSE_SORT, 'courses'),
    ...listInput(COMPLETION_SORT, 'completions'),
  }),
  load: async ({ id, ...lists }, user) => {
    const found = await getProvider(id, user.role)
    return (
      found && {
        ...found,
        upcoming: pageOf(found.upcoming, listQuery(lists, SESSION_SORT, 'sessions'), sessionKeys),
        byCourse: pageOf(
          found.byCourse,
          listQuery(lists, PROVIDER_COURSE_SORT, 'courses'),
          providerCourseKeys
        ),
        completionList: pageOf(
          found.completionList,
          listQuery(lists, COMPLETION_SORT, 'completions'),
          completionKeys
        ),
      }
    )
  },
})

/** The provider form: the provider (none for a new one) and the courses it can offer. */
export const providerForm = read({
  guard: 'admin',
  input: byId.partial(),
  load: async ({ id }) => {
    const [provider, courses] = await Promise.all([
      id ? getProviderForEdit(id) : null,
      listCourseOptions(),
    ])
    if (id && !provider) return null
    return { provider, courses: courses.map(c => ({ id: c.id, code: c.code, name: c.name })) }
  },
})
