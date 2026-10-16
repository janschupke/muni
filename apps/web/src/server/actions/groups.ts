'use server'

import { createGroup, type GroupKind, renameGroup } from '@muni/db/repositories'
import { groupSchema } from '@muni/domain/schemas'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { fieldErrors, formError, type FormState, text } from '@/lib/form'
import { requireAdmin } from '@/server/auth'

const PATH: Record<GroupKind, string> = { department: '/departments', position: '/positions' }

/** Creates a department or position (`id` null) or renames one, then shows it. */
export async function saveGroup(
  kind: GroupKind,
  id: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  if (!(kind in PATH)) return formError('generic')
  const input = { name: text(form, 'name') }
  const parsed = groupSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed.error, input)
  let saved: Awaited<ReturnType<typeof createGroup>>
  try {
    saved =
      id === null ? await createGroup(kind, parsed.data) : await renameGroup(kind, id, parsed.data)
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'P2025') return formError('not_found')
    console.error(error)
    return formError('generic')
  }
  if (!saved.ok) return { status: 'error', fieldErrors: { name: 'taken' } }
  revalidatePath('/', 'layout')
  redirect(`${PATH[kind]}/${saved.id}`)
}
