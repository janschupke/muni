'use client'

import { Button, buttonClass } from '@muni/ui/button'
import { Field, Input, Select, Textarea } from '@muni/ui/field'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  createContext,
  useActionState,
  useContext,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'

import { IDLE, type FormState } from '@/lib/form'

const ErrorsContext = createContext<Record<string, string>>({})

/** A form bound to a server action. Field components read their error from context. */
export function FormShell({
  action,
  cancelHref,
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  cancelHref: string
  children: ReactNode
}) {
  const t = useTranslations()
  const [state, formAction, pending] = useActionState(action, IDLE)
  const errors = state.status === 'error' ? state.fieldErrors : {}
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5" noValidate>
      {state.status === 'error' && state.formError && (
        <p
          role="alert"
          className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger-fg"
        >
          {t(`forms.errors.${state.formError as 'generic'}`)}
        </p>
      )}
      <ErrorsContext value={errors}>{children}</ErrorsContext>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t('common.saving') : t('common.save')}
        </Button>
        <Link href={cancelHref} className={buttonClass({ variant: 'ghost' })}>
          {t('common.cancel')}
        </Link>
      </div>
    </form>
  )
}

function useFieldError(name: string): string | undefined {
  const t = useTranslations('forms.errors')
  const key = useContext(ErrorsContext)[name]
  return key ? t(key as 'generic') : undefined
}

type BaseProps = {
  name: string
  label: string
  help?: string
  required?: boolean
  className?: string
}

export function TextField({
  name,
  label,
  help,
  required,
  className,
  ...input
}: BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'name'>) {
  const error = useFieldError(name)
  return (
    <Field label={label} help={help} error={error} required={required} className={className}>
      {props => <Input name={name} {...props} {...input} />}
    </Field>
  )
}

export function TextAreaField({
  name,
  label,
  help,
  defaultValue,
}: BaseProps & { defaultValue?: string }) {
  const error = useFieldError(name)
  return (
    <Field label={label} help={help} error={error}>
      {props => <Textarea name={name} defaultValue={defaultValue} {...props} />}
    </Field>
  )
}

export function SelectField({
  name,
  label,
  help,
  required,
  defaultValue,
  options,
  allowEmpty,
}: BaseProps & {
  defaultValue?: string
  options: { value: string; label: string }[]
  allowEmpty?: boolean
}) {
  const error = useFieldError(name)
  return (
    <Field label={label} help={help} error={error} required={required}>
      {props => (
        <Select name={name} defaultValue={defaultValue ?? ''} {...props}>
          {allowEmpty && <option value="">—</option>}
          {options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  )
}

export function CheckboxField({
  name,
  label,
  defaultChecked,
}: {
  name: string
  label: string
  defaultChecked?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-fg">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 accent-accent"
      />
      {label}
    </label>
  )
}
