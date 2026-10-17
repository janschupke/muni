'use server'

import { createProvider, updateProvider } from '@muni/db/repositories'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { formError, type FormState } from '@/lib/form'
import { parseForm, providerSpec } from '@/lib/form-inputs'
import { requireAdmin } from '@/server/auth'

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code

/** Creates a provider (`id` null) or saves one, then shows it. */
export async function saveProvider(
  id: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const parsed = parseForm(providerSpec, form)
  if (!parsed.ok) return parsed.state
  let saved: Awaited<ReturnType<typeof createProvider>>
  try {
    saved = id ? await updateProvider(id, parsed.data) : await createProvider(parsed.data)
  } catch (error) {
    if (codeOf(error) === 'P2025') return formError('not_found')
    console.error(error)
    return formError('generic')
  }
  if (!saved.ok) return { status: 'error', fieldErrors: { [saved.taken]: 'taken' } }
  revalidatePath('/', 'layout')
  redirect(`/providers/${saved.id}`)
}
