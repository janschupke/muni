'use client'

import { type FocusEvent, type RefObject, useEffect, useRef, useState } from 'react'

import { type FormState, IDLE } from '@/lib/form/form'
import { type FormSpec, parseForm } from '@/lib/form/form-inputs'

import type { ClientError, FormContextValue } from './form-context'
import { differing, focusField, type Snapshot, snapshot } from './form-dom'

/**
 * What a form knows about its fields as the user works: the values it opened with and has
 * now (so a field is dirty and the form clean), which were edited and visited, and which
 * errors show. A field shows its error once it was left (touched), at once when a required
 * field is emptied, and every error after a save was tried; `live` errors (checks the form
 * makes itself) show at once. A server error stays on its field until the field changes.
 * The first field has the focus when the form opens, and the first refused one after the
 * server refuses a save.
 */
export function useFormTracking(
  formRef: RefObject<HTMLFormElement | null>,
  spec: FormSpec,
  live: Partial<Record<string, ClientError>> | undefined,
  state: FormState
) {
  const [version, setVersion] = useState(0)
  const [initial, setInitial] = useState<Snapshot | null>(null)
  const [current, setCurrent] = useState<Snapshot | null>(null)
  const [checked, setChecked] = useState<FormState>(IDLE)
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set())
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  // What was sent with the save the server answered: its errors hold until a field changes.
  const [sent, setSent] = useState<Snapshot | null>(null)
  const last = useRef<Snapshot | null>(null)

  // Reads the form once the change has rendered (hidden inputs of pickers are current then).
  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const now = snapshot(form)
    const before = last.current
    last.current = now
    const changes = before ? differing(before, now) : []
    if (changes.length > 0) setEdited(names => new Set([...names, ...changes]))
    setInitial(first => first ?? now)
    setCurrent(now)
    const parsed = parseForm(spec, new FormData(form))
    setChecked(parsed.ok ? IDLE : parsed.state)
  }, [formRef, version, spec])

  // The first field has the focus when the form opens.
  useEffect(() => {
    if (formRef.current) focusField(formRef.current, () => true)
  }, [formRef])

  // A save the server refused: the first field it refused gets the focus.
  useEffect(() => {
    const form = formRef.current
    if (form && state.status === 'error') focusField(form, name => name in state.fieldErrors)
  }, [formRef, state])

  const changed = () => {
    setVersion(v => v + 1)
  }

  const clientError = (name: string): ClientError | undefined => {
    const own = live?.[name]
    if (own) return own
    if (checked.status !== 'error') return undefined
    const key = checked.fieldErrors[name]
    if (!key) return undefined
    const shown = submitted || touched.has(name) || (edited.has(name) && key === 'required')
    return shown ? { key, values: checked.values?.[name] } : undefined
  }
  const serverError = (name: string): ClientError | undefined => {
    if (state.status !== 'error') return undefined
    const key = state.fieldErrors[name]
    if (!key || (sent && current && sent.get(name) !== current.get(name))) return undefined
    return { key, values: state.values?.[name] }
  }

  const context: FormContextValue = {
    fieldState: name => ({
      error: clientError(name) ?? serverError(name),
      dirty: !!initial && !!current && initial.get(name) !== current.get(name),
      touched: touched.has(name),
    }),
    changed,
  }

  return {
    context,
    /** Nothing differs from what the form opened with. */
    clean: !!initial && !!current && differing(initial, current).length === 0,
    changed,
    /** A field left: it shows its errors from now on (not while the focus is in its own popup). */
    blurred: (event: FocusEvent<HTMLFormElement>) => {
      const field = (event.target as Element).closest<HTMLElement>('[data-field]')
      const name = field?.dataset['field']
      if (!field || !name || touched.has(name)) return
      // Still inside the field: its own button, or its calendar or list (in a portal).
      const next = event.relatedTarget
      if (next && (field.contains(next) || next.closest('[data-radix-popper-content-wrapper]')))
        return
      setTouched(names => new Set([...names, name]))
    },
    /**
     * A save was tried: every error shows from now on. True when the form may be sent;
     * otherwise the first wrong field gets the focus.
     */
    tried: (form: HTMLFormElement, data: FormData): boolean => {
      const parsed = parseForm(spec, data)
      setSubmitted(true)
      const wrong = new Set([
        ...(parsed.ok
          ? []
          : Object.keys(parsed.state.status === 'error' ? parsed.state.fieldErrors : {})),
        ...Object.keys(live ?? {}),
      ])
      if (wrong.size === 0) return true
      setChecked(parsed.ok ? IDLE : parsed.state)
      focusField(form, name => wrong.has(name))
      return false
    },
    /** The form is being sent as it is now. */
    sending: (form: HTMLFormElement) => {
      setSent(snapshot(form))
    },
  }
}
