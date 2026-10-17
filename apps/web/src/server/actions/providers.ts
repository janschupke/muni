'use server'

import { createProvider, updateProvider } from '@muni/db/repositories'

import type { FormState } from '@/lib/form'
import { parseForm, providerSpec } from '@/lib/form-inputs'

import { isBoundIdOrNull, saveForm } from './guard'

/** Creates a provider (`id` null) or saves one, then shows it. */
export async function saveProvider(
  id: string | null,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  return saveForm(isBoundIdOrNull(id), async () => {
    const parsed = parseForm(providerSpec, form)
    if (!parsed.ok) return parsed.state
    const saved = id ? await updateProvider(id, parsed.data) : await createProvider(parsed.data)
    if (!saved.ok) return { status: 'error', fieldErrors: { [saved.taken]: 'taken' } }
    return { status: 'saved', href: `/providers/${saved.id}` }
  })
}
