'use server'

import { createRoom, isPrismaCode, updateRoom } from '@muni/db/repositories'

import { type FormState, refusedField } from '@/lib/form'
import { parseForm, roomSpec } from '@/lib/form-inputs'

import { isBoundIdOrNull, saveForm } from './guard'

/** Creates a room (`id` null) or saves one, then shows it. */
export async function saveRoom(
  id: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  return saveForm(isBoundIdOrNull(id), async () => {
    const parsed = parseForm(roomSpec, form)
    if (!parsed.ok) return parsed.state
    try {
      const saved = id ? await updateRoom(id, parsed.data) : await createRoom(parsed.data)
      if (!saved.ok) return refusedField(saved.field, 'sessions_unfit', { count: saved.count })
      return { status: 'saved', href: `/rooms/${saved.id}` }
    } catch (error) {
      // Two rooms named alike at once: the index refused the second.
      if (isPrismaCode(error, 'P2002')) return { status: 'error', fieldErrors: { name: 'taken' } }
      throw error
    }
  })
}
