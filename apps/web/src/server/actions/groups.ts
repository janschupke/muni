'use server'

import {
  type GroupProblem,
  type GroupWrite,
  saveDepartment,
  savePosition,
} from '@muni/db/repositories'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { formError, type FormState, refusedField } from '@/lib/form'
import { departmentSpec, parseForm, positionSpec } from '@/lib/form-inputs'
import { requireAdmin } from '@/server/auth'

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

async function finish(save: () => Promise<GroupWrite>, path: string): Promise<FormState> {
  let saved: GroupWrite
  try {
    saved = await save()
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'P2025') return formError('not_found')
    console.error(error)
    return formError('generic')
  }
  if (!saved.ok) return refused(saved)
  revalidatePath('/', 'layout')
  redirect(`${path}/${saved.id}`)
}

/** Creates a department (`id` null) or saves one (its name and head), then shows it. */
export async function saveDepartmentAction(
  id: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const parsed = parseForm(departmentSpec, form)
  if (!parsed.ok) return parsed.state
  return finish(() => saveDepartment(id, parsed.data), '/departments')
}

/** Creates a position (`id` null) or saves one (its name and departments), then shows it. */
export async function savePositionAction(
  id: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const parsed = parseForm(positionSpec, form)
  if (!parsed.ok) return parsed.state
  return finish(() => savePosition(id, parsed.data), '/positions')
}
