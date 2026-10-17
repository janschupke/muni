'use server'

import { createRoom, type RoomWrite, updateRoom } from '@muni/db/repositories'

import { formError, type FormState, refusedField } from '@/lib/form'
import { parseForm, roomSpec } from '@/lib/form-inputs'
import { requireAdmin } from '@/server/auth'

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code

/** Creates a room (`id` null) or saves one, then shows it. */
export async function saveRoom(
  id: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const parsed = parseForm(roomSpec, form)
  if (!parsed.ok) return parsed.state
  let saved: RoomWrite
  try {
    saved = id ? await updateRoom(id, parsed.data) : await createRoom(parsed.data)
  } catch (error) {
    const code = codeOf(error)
    if (code === 'P2002') return { status: 'error', fieldErrors: { name: 'taken' } }
    if (code === 'P2025') return formError('not_found')
    console.error(error)
    return formError('generic')
  }
  if (!saved.ok) return refusedField(saved.field, 'sessions_unfit', { count: saved.count })
  return { status: 'saved', href: `/rooms/${saved.id}` }
}
