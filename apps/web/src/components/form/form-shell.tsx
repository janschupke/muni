'use client'

import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { Checkbox } from '@muni/ui/checkbox'
import { Field, Input, Textarea } from '@muni/ui/field'
import { Select } from '@muni/ui/select'
import { PLACEHOLDER } from '@muni/utils/format'
import { Save, X } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  createContext,
  useActionState,
  useContext,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'

import { IDLE, type FieldErrorKey, type FormState } from '@/lib/form'

const ErrorsContext = createContext<Partial<Record<string, FieldErrorKey>>>({})

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
        <Alert tone="danger">{t(`forms.errors.${state.formError}`)}</Alert>
      )}
      <ErrorsContext value={errors}>{children}</ErrorsContext>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          <Save aria-hidden />
          {pending ? t('common.saving') : t('common.save')}
        </Button>
        <Button asChild variant="ghost">
          <Link href={cancelHref}>
            <X aria-hidden />
            {t('common.cancel')}
          </Link>
        </Button>
      </div>
    </form>
  )
}

function useFieldError(name: string): string | undefined {
  const t = useTranslations('forms.errors')
  const key = useContext(ErrorsContext)[name]
  return key ? t(key) : undefined
}

type BaseProps = {
  name: string
  label: string
  help?: string | undefined
  required?: boolean | undefined
  className?: string | undefined
}

export function TextField({
  name,
  label,
  help,
  required,
  className,
  ...input
}: BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'size'>) {
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
}: BaseProps & { defaultValue?: string | undefined }) {
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
  defaultValue?: string | undefined
  options: { value: string; label: string }[]
  allowEmpty?: boolean | undefined
}) {
  const error = useFieldError(name)
  const t = useTranslations('common')
  return (
    <Field label={label} help={help} error={error} required={required}>
      {props => (
        <Select
          name={name}
          defaultValue={defaultValue ?? ''}
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
  const error = useFieldError(name)
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-fg">{label}</legend>
      {help && <p className="-mt-1 text-xs text-fg-muted">{help}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(o => (
          <Checkbox
            key={o.value}
            name={name}
            value={o.value}
            label={o.label}
            defaultChecked={defaultValue.includes(o.value)}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      )}
    </fieldset>
  )
}

export function CheckboxField({
  name,
  label,
  defaultChecked,
}: {
  name: string
  label: string
  defaultChecked?: boolean | undefined
}) {
  return <Checkbox name={name} label={label} defaultChecked={defaultChecked} />
}
