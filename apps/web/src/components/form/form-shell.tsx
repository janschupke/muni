'use client'

import { Alert } from '@muni/ui/alert'
import { Button, CancelButton } from '@muni/ui/button'
import { Card, CardBody } from '@muni/ui/card'
import { Checkbox } from '@muni/ui/checkbox'
import { DatePicker } from '@muni/ui/date-picker'
import { Field, Fieldset, Input, Textarea } from '@muni/ui/field'
import { PageHeader } from '@muni/ui/page-header'
import { Select } from '@muni/ui/select'
import { TimePicker } from '@muni/ui/time-picker'
import { todayIn } from '@muni/utils/dates'
import { PLACEHOLDER } from '@muni/utils/format'
import { Save, X } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import {
  createContext,
  type FocusEvent,
  type InputHTMLAttributes,
  type ReactNode,
  startTransition,
  type SubmitEvent,
  type TextareaHTMLAttributes,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { useOrigin } from '@/components/navigation/navigation-history'
import { type FieldErrorKey, type FormState, IDLE } from '@/lib/form/form'
import { type FormSpec, parseForm } from '@/lib/form/form-inputs'
import type { WriteKind } from '@/lib/query/invalidation'
import { useWhenWritten } from '@/lib/query/use-after-write'

import { useDateLabels, useTimeLabels } from './picker-labels'

/** An error the form knows before it is sent (a key under forms.errors, and its values). */
export interface ClientError {
  key: FieldErrorKey
  values?: Record<string, string | number> | undefined
}

/** What one field shows: its error (translated), and whether it changed or was visited. */
interface FieldState {
  error: string | undefined
  dirty: boolean
  touched: boolean
}

interface FormContext {
  fieldState: (name: string) => Omit<FieldState, 'error'> & { error: ClientError | undefined }
  /** A field's value changed (after the change renders, the form checks itself again). */
  changed: () => void
}

const Context = createContext<FormContext>({
  fieldState: () => ({ error: undefined, dirty: false, touched: false }),
  changed: () => undefined,
})

/** A form's values by field name (several values of one name joined), to compare. */
type Snapshot = ReadonlyMap<string, string>

function snapshot(form: HTMLFormElement): Snapshot {
  const values = new Map<string, string[]>()
  for (const [name, value] of new FormData(form)) {
    if (typeof value !== 'string') continue
    values.set(name, [...(values.get(name) ?? []), value])
  }
  // A checkbox group posts nothing when none is ticked: name it anyway, so unticking the
  // last box counts as a change.
  for (const field of form.querySelectorAll<HTMLElement>('[data-field]')) {
    const name = field.dataset['field']
    if (name && !values.has(name)) values.set(name, [])
  }
  return new Map([...values].map(([name, list]) => [name, list.join('\u001f')]))
}

/** The names whose value differs between two snapshots. */
const differing = (a: Snapshot, b: Snapshot) =>
  [...new Set([...a.keys(), ...b.keys()])].filter(name => a.get(name) !== b.get(name))

const FOCUSABLE = 'input:not([type=hidden]):not([aria-hidden]), textarea, button, [tabindex]'

/** Focuses the control of the first field (in page order) that `pick` accepts. */
function focusField(form: HTMLFormElement, pick: (name: string) => boolean) {
  for (const field of form.querySelectorAll<HTMLElement>('[data-field]')) {
    const name = field.dataset['field']
    if (!name || !pick(name)) continue
    const control = [...field.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
      c => !(c as HTMLInputElement).disabled
    )
    if (control) {
      control.focus()
      return
    }
  }
}

/**
 * A save that does more than its form shows (cancelling a session with people on it): the
 * form asks before sending. `body` says exactly what will happen; `confirmLabel` names it.
 */
export interface SaveConfirmation {
  title: string
  body: ReactNode
  confirmLabel: string
  tone?: 'primary' | 'danger' | undefined
}

/** What every form page's heading row says: the title, and where the back link goes. */
export interface FormHeading {
  title: string
  eyebrow?: ReactNode | undefined
  description?: ReactNode | undefined
}

/**
 * A form page bound to a server action. The page's heading row is part of the form: Cancel
 * and Save sit on its right, the fields below in one full-width card.
 *
 * The form checks itself as the user types, with the same reader and schema the action runs
 * on save (`spec`). A field shows its error once it was left (touched), at once when a
 * required field is emptied, and every error after a save was tried; once shown, an error
 * follows each keystroke. A form with errors is not sent: the first wrong field gets the
 * focus. `clientErrors` are checks the form makes itself (a room too small), shown at once.
 * A server error stays on its field until the field changes. An edit form cannot be saved
 * before something changed. The first field has the focus when the page opens.
 */
export function FormShell({
  action,
  spec,
  isNew = false,
  cancelHref,
  heading,
  clientErrors: live,
  submitLabel,
  savedMessage,
  writes,
  confirm,
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  spec: FormSpec
  /** A new record: savable as it is. An edit needs a change first. */
  isNew?: boolean | undefined
  cancelHref: string
  heading: FormHeading
  clientErrors?: Partial<Record<string, ClientError>> | undefined
  /** What the button does: "Schedule session", "Record completion", "Save changes". */
  submitLabel: string
  /** The toast once it is saved: "Course created". */
  savedMessage: string
  /** What saving it changes, so the pages that show it read afresh. */
  writes: WriteKind
  /** Asks before a save that does more than it shows; null when this one needs no asking. */
  confirm?: ((form: FormData) => SaveConfirmation | null) | undefined
  children: ReactNode
}) {
  const t = useTranslations()
  const formRef = useRef<HTMLFormElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const [state, formAction, pending] = useActionState(action, IDLE)
  // Saved or cancelled, the form goes back where it was opened from; opened directly, a
  // save goes to the record and a cancel to its parent page.
  const origin = useOrigin()
  useWhenWritten(
    writes,
    state,
    state.status === 'saved',
    state.status === 'saved' ? (origin ?? state.href) : undefined,
    { title: savedMessage }
  )
  const [asking, setAsking] = useState<{ data: FormData; question: SaveConfirmation } | null>(null)
  // Saved: the next page is on its way; nothing more to send from here.
  const busy = pending || state.status === 'saved'

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
  }, [version, spec])

  // The first field has the focus when the form opens.
  useEffect(() => {
    if (formRef.current) focusField(formRef.current, () => true)
  }, [])

  // A save the server refused: the first field it refused gets the focus.
  useEffect(() => {
    const form = formRef.current
    if (form && state.status === 'error') focusField(form, name => name in state.fieldErrors)
  }, [state])

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
  const context: FormContext = {
    fieldState: name => ({
      error: clientError(name) ?? serverError(name),
      dirty: !!initial && !!current && initial.get(name) !== current.get(name),
      touched: touched.has(name),
    }),
    changed,
  }

  const clean = !!initial && !!current && differing(initial, current).length === 0

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    // Sent by hand, so React does not reset the fields after the action: a refused save
    // keeps everything the user typed.
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const parsed = parseForm(spec, data)
    setSubmitted(true)
    const wrong = new Set([
      ...(parsed.ok
        ? []
        : Object.keys(parsed.state.status === 'error' ? parsed.state.fieldErrors : {})),
      ...Object.keys(live ?? {}),
    ])
    if (wrong.size > 0) {
      setChecked(parsed.ok ? IDLE : parsed.state)
      focusField(form, name => wrong.has(name))
      return
    }
    const question = confirm?.(data) ?? null
    if (question) {
      setAsking({ data, question })
      return
    }
    send(form, data)
  }

  const send = (form: HTMLFormElement, data: FormData) => {
    setSent(snapshot(form))
    startTransition(() => {
      formAction(data)
    })
  }

  const blurred = (event: FocusEvent<HTMLFormElement>) => {
    const field = (event.target as Element).closest<HTMLElement>('[data-field]')
    const name = field?.dataset['field']
    if (!field || !name || touched.has(name)) return
    // Still inside the field: its own button, or its calendar or list (in a portal).
    const next = event.relatedTarget
    if (next && (field.contains(next) || next.closest('[data-radix-popper-content-wrapper]')))
      return
    setTouched(names => new Set([...names, name]))
  }

  const hasErrors =
    state.status === 'error' && (!!state.formError || Object.keys(state.fieldErrors).length > 0)
  return (
    <form
      ref={formRef}
      onSubmit={submit}
      onChange={changed}
      onBlur={blurred}
      className="flex flex-col gap-4"
      noValidate
    >
      <PageHeader
        title={heading.title}
        eyebrow={heading.eyebrow}
        description={heading.description}
        actions={
          <>
            <CancelButton asChild>
              <Link href={origin ?? cancelHref}>
                <X aria-hidden />
                {t('common.cancel')}
              </Link>
            </CancelButton>
            <Button
              ref={submitRef}
              type="submit"
              variant="primary"
              disabled={busy || (!isNew && clean)}
            >
              <Save aria-hidden />
              {busy ? t('common.saving') : submitLabel}
            </Button>
          </>
        }
      />
      {hasErrors && (
        <Alert tone="danger">
          {t(state.formError ? `forms.errors.${state.formError}` : 'forms.fixBelow')}
        </Alert>
      )}
      <Card>
        <CardBody className="flex flex-col gap-6">
          <Context value={context}>{children}</Context>
        </CardBody>
      </Card>
      {asking && (
        <ConfirmDialog
          open
          onOpenChange={open => {
            if (!open) setAsking(null)
          }}
          title={asking.question.title}
          confirmLabel={asking.question.confirmLabel}
          cancelLabel={t('common.keepEditing')}
          tone={asking.question.tone}
          returnFocusTo={() => submitRef.current}
          onConfirm={() => {
            const form = formRef.current
            if (form) send(form, asking.data)
            return Promise.resolve({ kind: 'go' })
          }}
        >
          <div className="flex flex-col gap-3 text-sm">{asking.question.body}</div>
        </ConfirmDialog>
      )}
    </form>
  )
}

/** A titled group of fields inside a form's card, set off from the one above. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string | undefined
  children: ReactNode
}) {
  const id = useId()
  // A group named by its heading: a real h2, so heading navigation runs through a long form.
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="flex flex-col gap-4 border-t border-border-muted pt-5 first:border-t-0 first:pt-0"
    >
      <div>
        <h2 id={id} className="text-sm font-semibold text-fg">
          {title}
        </h2>
        {description && <p className="text-xs text-fg-muted">{description}</p>}
      </div>
      {children}
    </div>
  )
}

/** A field's state in its form, with the error translated. */
export function useField(name: string): FieldState & { changed: () => void } {
  const t = useTranslations('forms.errors')
  const form = useContext(Context)
  const { error, ...state } = form.fieldState(name)
  return { ...state, error: error && t(error.key, error.values), changed: form.changed }
}

interface BaseProps {
  name: string
  label: string
  help?: string | undefined
  required?: boolean | undefined
  className?: string | undefined
  /** The label for assistive technology only (a control in a table row). */
  hideLabel?: boolean | undefined
}

export function TextField({
  name,
  label,
  help,
  required,
  className,
  hideLabel,
  ...input
}: BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'size'>) {
  const { changed: _, ...field } = useField(name)
  return (
    <Field
      name={name}
      label={label}
      hideLabel={hideLabel}
      help={help}
      required={required}
      className={className}
      {...field}
    >
      {props => <Input name={name} {...input} {...props} />}
    </Field>
  )
}

/** A date: typed or picked from a calendar; posts `YYYY-MM-DD`. */
export function DateField({
  name,
  label,
  help,
  required,
  defaultValue,
  value,
  onValueChange,
  min,
  max,
}: BaseProps & {
  defaultValue?: string | null | undefined
  value?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
  min?: string | undefined
  max?: string | undefined
}) {
  const { changed, ...field } = useField(name)
  const dateLabels = useDateLabels()
  const locale = useLocale()
  return (
    <Field name={name} label={label} help={help} required={required} {...field}>
      {props => (
        <DatePicker
          name={name}
          defaultValue={defaultValue ?? ''}
          value={value}
          onValueChange={next => {
            onValueChange?.(next)
            changed()
          }}
          min={min}
          max={max}
          today={todayIn()}
          locale={locale}
          labels={dateLabels(label)}
          {...props}
        />
      )}
    </Field>
  )
}

/** A time of day: typed or picked from hours and minutes; posts `HH:mm`. */
export function TimeField({
  name,
  label,
  help,
  required,
  defaultValue,
  value,
  onValueChange,
}: BaseProps & {
  defaultValue?: string | null | undefined
  value?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
}) {
  const { changed, ...field } = useField(name)
  const timeLabels = useTimeLabels()
  return (
    <Field name={name} label={label} help={help} required={required} {...field}>
      {props => (
        <TimePicker
          name={name}
          defaultValue={defaultValue ?? ''}
          value={value}
          onValueChange={next => {
            onValueChange?.(next)
            changed()
          }}
          labels={timeLabels(label)}
          {...props}
        />
      )}
    </Field>
  )
}

export function TextAreaField({
  name,
  label,
  help,
  required,
  className,
  ...textarea
}: BaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'name'>) {
  const { changed: _, ...field } = useField(name)
  return (
    <Field
      name={name}
      label={label}
      help={help}
      required={required}
      className={className}
      {...field}
    >
      {props => <Textarea name={name} {...textarea} {...props} />}
    </Field>
  )
}

export function SelectField({
  name,
  label,
  help,
  required,
  defaultValue,
  value,
  onValueChange,
  options,
  allowEmpty,
  hideLabel,
}: BaseProps & {
  defaultValue?: string | undefined
  value?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
  options: { value: string; label: string; disabled?: boolean | undefined }[]
  allowEmpty?: boolean | undefined
}) {
  const { changed, ...field } = useField(name)
  const t = useTranslations('common')
  return (
    <Field
      name={name}
      label={label}
      hideLabel={hideLabel}
      help={help}
      required={required}
      {...field}
    >
      {props => (
        <Select
          name={name}
          defaultValue={defaultValue ?? ''}
          value={value}
          onValueChange={next => {
            onValueChange?.(next)
            changed()
          }}
          options={options}
          emptyLabel={allowEmpty ? PLACEHOLDER : undefined}
          placeholder={t('choose')}
          {...props}
        />
      )}
    </Field>
  )
}

/** Several checkboxes posting one name; the action reads them with `list(form, name)`. */
export function CheckboxGroupField({
  name,
  label,
  help,
  options,
  defaultValue,
}: {
  name: string
  label: string
  help?: string | undefined
  options: readonly { value: string; label: string }[]
  defaultValue: readonly string[]
}) {
  const { error, changed, dirty, touched } = useField(name)
  return (
    <Fieldset name={name} legend={label} help={help} error={error} dirty={dirty} touched={touched}>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(o => (
          <Checkbox
            key={o.value}
            name={name}
            value={o.value}
            label={o.label}
            defaultChecked={defaultValue.includes(o.value)}
            onCheckedChange={changed}
            aria-invalid={error ? true : undefined}
          />
        ))}
      </div>
    </Fieldset>
  )
}

export function CheckboxField({
  name,
  label,
  help,
  defaultChecked,
  checked,
  onCheckedChange,
  disabled,
}: {
  name: string
  label: string
  help?: string | undefined
  defaultChecked?: boolean | undefined
  checked?: boolean | undefined
  onCheckedChange?: ((checked: boolean) => void) | undefined
  disabled?: boolean | undefined
}) {
  const { error, changed, dirty, touched } = useField(name)
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ')
  return (
    <div
      data-field={name}
      data-dirty={dirty ? true : undefined}
      data-touched={touched ? true : undefined}
      data-invalid={error ? true : undefined}
      className="flex flex-col gap-1"
    >
      <Checkbox
        name={name}
        label={label}
        defaultChecked={defaultChecked}
        checked={checked}
        onCheckedChange={next => {
          onCheckedChange?.(next)
          changed()
        }}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {help && (
        <p id={helpId} className="text-xs text-fg-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} aria-live="polite" className="text-xs text-danger-fg">
          {error}
        </p>
      )}
    </div>
  )
}
