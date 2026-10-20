import 'server-only'

import {
  getCompletionForEdit,
  getEmployee,
  getEmployeeForEdit,
  getPersonName,
  getPolicy,
  listCourseOptions,
  listDepartmentHeads,
  listDepartmentPositions,
  listDepartments,
  listEmployeeOptions,
  listEmployees,
  listGroupOptions,
  listPositions,
  listProviderOptions,
  pageOf,
} from '@muni/db/repositories'
import { COMPLIANCE_STATUSES, EMPLOYEE_SORT_KEYS, EMPLOYMENT_STATES } from '@muni/domain/enums'
import { displayName, sortName } from '@muni/domain/names'
import { isVisible } from '@muni/domain/sanitize'
import * as z from 'zod'

import { HISTORY_SORT } from '@/lib/list/list-keys'
import { listQuery } from '@/lib/list/search-params'

import { byExternalId, listInput, read } from './core/define'
import { historyKeys } from './core/sorters'

const text = z.string().min(1).max(200).optional()

/** The employee list: one page of the filtered, sorted people, and the filter choices. */
export const employeesList = read({
  guard: 'reader',
  input: z.object({
    q: text,
    department: text,
    position: text,
    status: z.enum(EMPLOYMENT_STATES).optional(),
    compliance: z.enum(COMPLIANCE_STATUSES).optional(),
    manager: text,
    sort: z.enum(EMPLOYEE_SORT_KEYS).optional(),
    dir: z.literal('desc').optional(),
    page: z.coerce.number().int().min(1).optional(),
  }),
  load: async ({ sort, dir, page, ...filters }) => {
    const [result, departments, positions, managerName] = await Promise.all([
      listEmployees({
        ...filters,
        sort: sort && { by: sort, desc: dir === 'desc' },
        page: page ?? 1,
      }),
      listDepartments(),
      listPositions(),
      filters.manager ? getPersonName(filters.manager) : null,
    ])
    return { result, departments, positions, managerName }
  },
})

/**
 * A person's page: the record (as the role may see it, its requirements with their bookings)
 * with a page of their completions (`completionsSort`…, sorted on the server).
 */
export const employee = read({
  guard: 'reader',
  input: byExternalId.extend(listInput(HISTORY_SORT, 'completions')),
  load: async ({ externalId, ...list }, user) => {
    const person = await getEmployee(externalId, user.role)
    if (!person) return null
    return {
      employee: {
        ...person,
        completions: pageOf(
          person.completions,
          listQuery(list, HISTORY_SORT, 'completions'),
          historyKeys
        ),
      },
      showNotes: isVisible(getPolicy(), 'completion.note', user.role),
    }
  },
})

/** The person form: the person (none for a new one) and every choice it offers. */
export const employeeForm = read({
  guard: 'admin',
  input: byExternalId.partial(),
  load: async ({ externalId }) => {
    const [person, departments, positions, pairs, heads, people] = await Promise.all([
      externalId ? getEmployeeForEdit(externalId) : null,
      listGroupOptions('department'),
      listGroupOptions('position'),
      listDepartmentPositions(),
      listDepartmentHeads(),
      listEmployeeOptions(),
    ])
    if (externalId && !person) return null
    // Anyone else may manage them; their current manager stays offered even after leaving.
    const managers = people.filter(p => p.id !== person?.id)
    if (person?.manager && !managers.some(m => m.id === person.manager?.id))
      managers.push({ ...person.manager, externalId: '', departmentId: null })
    return { employee: person, departments, positions, pairs, heads, managers }
  },
})

/**
 * The completion form, for a person: a new completion (no `id`), or one of theirs to correct.
 * A record keeps its own choices even when they are no longer offered: a person who left, an
 * archived course or provider.
 */
export const completionForm = read({
  guard: 'admin',
  input: byExternalId.extend({ id: z.string().min(1).max(64).optional() }),
  load: async ({ externalId, id }) => {
    const [person, completion, courses, providers, employees] = await Promise.all([
      getEmployeeForEdit(externalId),
      id ? getCompletionForEdit(id) : null,
      listCourseOptions(),
      listProviderOptions(),
      listEmployeeOptions(),
    ])
    if (!person) return null
    // The address names the person too: a completion of someone else is not found here.
    if (id && completion?.employee.externalId !== externalId) return null
    const own = completion?.employee ?? {
      id: person.id,
      name: sortName(person),
    }
    return {
      person: { id: person.id, name: displayName(person) },
      completion,
      employees: employees.some(e => e.id === own.id) ? employees : [...employees, own],
      courses:
        !completion || courses.some(c => c.id === completion.course.id)
          ? courses
          : [...courses, completion.course],
      providers:
        !completion?.provider || providers.some(p => p.id === completion.provider?.id)
          ? providers
          : [...providers, completion.provider],
    }
  },
})
