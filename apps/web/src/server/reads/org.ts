import 'server-only'

import {
  getDepartment,
  getDepartmentForEdit,
  getPosition,
  getPositionForEdit,
  listDepartmentSummaries,
  listGroupOptions,
  listPositionSummaries,
} from '@muni/db/repositories'

import { byId, none, read } from './define'

/** Every department, with its people and compliance. */
export const departmentsList = read({
  guard: 'reader',
  input: none,
  load: () => listDepartmentSummaries(),
})

/** Every position, with its people and compliance. */
export const positionsList = read({
  guard: 'reader',
  input: none,
  load: () => listPositionSummaries(),
})

/** A department's page: its head, positions, courses and people. */
export const department = read({
  guard: 'reader',
  input: byId,
  load: ({ id }) => getDepartment(id),
})

/** A position's page: its departments, courses and people. */
export const position = read({ guard: 'reader', input: byId, load: ({ id }) => getPosition(id) })

/** The department form: its name, and the members who can lead it. */
export const departmentForm = read({
  guard: 'admin',
  input: byId,
  load: ({ id }) => getDepartmentForEdit(id),
})

/** The position form: the position (none for a new one) and the departments it can be in. */
export const positionForm = read({
  guard: 'admin',
  input: byId.partial(),
  load: async ({ id }) => {
    const [edited, departments] = await Promise.all([
      id ? getPositionForEdit(id) : null,
      listGroupOptions('department'),
    ])
    if (id && !edited) return null
    return { position: edited, departments }
  },
})
