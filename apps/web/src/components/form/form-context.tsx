'use client'

import { useTranslations } from 'next-intl'
import { createContext, useContext } from 'react'

import type { FieldErrorKey } from '@/lib/form/form'

/** An error the form knows before it is sent (a key under forms.errors, and its values). */
export interface ClientError {
  key: FieldErrorKey
  values?: Record<string, string | number> | undefined
}

/** What one field shows: its error (translated), and whether it changed or was visited. */
export interface FieldState {
  error: string | undefined
  dirty: boolean
  touched: boolean
}

export interface FormContextValue {
  fieldState: (name: string) => Omit<FieldState, 'error'> & { error: ClientError | undefined }
  /** A field's value changed (after the change renders, the form checks itself again). */
  changed: () => void
}

export const FormContext = createContext<FormContextValue>({
  fieldState: () => ({ error: undefined, dirty: false, touched: false }),
  changed: () => undefined,
})

/** A field's state in its form, with the error translated. */
export function useField(name: string): FieldState & { changed: () => void } {
  const t = useTranslations('forms.errors')
  const form = useContext(FormContext)
  const { error, ...state } = form.fieldState(name)
  return { ...state, error: error && t(error.key, error.values), changed: form.changed }
}
