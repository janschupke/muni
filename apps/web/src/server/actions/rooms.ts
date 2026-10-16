'use server'

import { createRoom, updateRoom } from '@muni/db/repositories'
import { roomSchema } from '@muni/domain/schemas'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { fieldErrors, formError, type FormState, list, number, text } from '@/lib/form'
import { requireAdmin } from '@/server/auth'

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code

/** Creates a room (`id` null) or saves one, then shows it. */
export async function saveRoom(
  id: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const input = {
    name: text(form, 'name'),
    kind: text(form, 'kind'),
    capacity: number(form, 'capacity'),
    capabilities: list(form, 'capabilities'),
    note: text(form, 'note'),
  }
  const parsed = roomSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed.error, input)
  let saved: { id: string }
  try {
    saved = id ? await updateRoom(id, parsed.data) : await createRoom(parsed.data)
  } catch (error) {
    const code = codeOf(error)
    if (code === 'P2002') return { status: 'error', fieldErrors: { name: 'taken' } }
    if (code === 'P2025') return formError('not_found')
    console.error(error)
    return formError('generic')
  }
  revalidatePath('/', 'layout')
  redirect(`/rooms/${saved.id}`)
}
