'use server'

import {
  type GroupProblem,
  type GroupWrite,
  saveDepartment,
  savePosition,
} from '@muni/db/repositories'

import { type FormState, refusedField } from '@/lib/form/form'
import { departmentSpec, parseForm, positionSpec } from '@/lib/form/form-inputs'

import { isBoundIdOrNull, saveForm } from './guard'

/** A refused group write, on the field to change. */
function refused(problem: GroupProblem): FormState {
  switch (problem.reason) {
    case 'in_use':
      return refusedField(problem.field, 'in_use', { count: problem.count })
    case 'not_found':
      return refusedField(problem.field, 'unavailable')
    default:
      return refusedField(problem.field, problem.reason)
  }
}

function finish(saved: GroupWrite, path: string): FormState {
  if (!saved.ok) return refused(saved)
  return { status: 'saved', href: `${path}/${saved.id}` }
}

/** Creates a department (`id` null) or saves one (its name and head), then shows it. */
export async function saveDepartmentAction(
  id: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  return saveForm(isBoundIdOrNull(id), async () => {
    const parsed = parseForm(departmentSpec, form)
    if (!parsed.ok) return parsed.state
    return finish(await saveDepartment(id, parsed.data), '/departments')
  })
}

/** Creates a position (`id` null) or saves one (its name and departments), then shows it. */
export async function savePositionAction(
  id: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  return saveForm(isBoundIdOrNull(id), async () => {
    const parsed = parseForm(positionSpec, form)
    if (!parsed.ok) return parsed.state
    return finish(await savePosition(id, parsed.data), '/positions')
  })
}
