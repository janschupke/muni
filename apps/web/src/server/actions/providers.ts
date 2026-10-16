'use server'

import { createProvider, updateProvider } from '@muni/db/repositories'
import { providerSchema } from '@muni/domain/schemas'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { fieldErrors, formError, type FormState, text } from '@/lib/form'
import { requireAdmin } from '@/server/auth'

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code

/** Creates a provider (`id` null) or saves one, then shows it. */
export async function saveProvider(
  id: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  await requireAdmin()
  const input = {
    name: text(form, 'name'),
    companyId: text(form, 'companyId'),
    email: text(form, 'email'),
    phone: text(form, 'phone'),
    website: text(form, 'website'),
    note: text(form, 'note'),
  }
  const parsed = providerSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed.error, input)
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
