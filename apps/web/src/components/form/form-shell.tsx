'use client'

import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { Card, CardBody } from '@muni/ui/card'
import { Checkbox } from '@muni/ui/checkbox'
import { DatePicker } from '@muni/ui/date-picker'
import { Field, Input, Textarea } from '@muni/ui/field'
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
  type InputHTMLAttributes,
  type ReactNode,
  useActionState,
  useContext,
} from 'react'

import { type FieldErrorKey, type FormState, IDLE } from '@/lib/form'

const ErrorsContext = createContext<Partial<Record<string, FieldErrorKey>>>({})

/** What every form page's heading row says: the title, and where the back link goes. */
export interface FormHeading {
  title: string
  eyebrow?: ReactNode | undefined
  description?: ReactNode | undefined
}

/**
 * A form page bound to a server action. The page's heading row is part of the form: Cancel
 * and Save sit on its right, the fields below in one full-width card. Field components read
 * their error from context.
 */
export function FormShell({
  action,
  cancelHref,
  heading,
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  cancelHref: string
  heading: FormHeading
  children: ReactNode
}) {
  const t = useTranslations()
  const [state, formAction, pending] = useActionState(action, IDLE)
  const errors = state.status === 'error' ? state.fieldErrors : {}
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <PageHeader
        title={heading.title}
        eyebrow={heading.eyebrow}
        description={heading.description}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={cancelHref}>
                <X aria-hidden />
                {t('common.cancel')}
              </Link>
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              <Save aria-hidden />
              {pending ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      />
      {state.status === 'error' && (
        <Alert tone="danger">
          {t(state.formError ? `forms.errors.${state.formError}` : 'forms.fixBelow')}
        </Alert>
      )}
      <Card>
        <CardBody className="flex flex-col gap-6">
          <ErrorsContext value={errors}>{children}</ErrorsContext>
        </CardBody>
      </Card>
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
  return (
    <fieldset className="flex flex-col gap-4 border-t border-border-muted pt-5 first:border-t-0 first:pt-0">
      {/* A legend does not lay out as a flex item; it names the group, the heading shows it. */}
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="text-sm font-semibold text-fg">{title}</p>
        {description && <p className="text-xs text-fg-muted">{description}</p>}
      </div>
      {children}
    </fieldset>
  )
}

function useFieldError(name: string): string | undefined {
  const t = useTranslations('forms.errors')
  const key = useContext(ErrorsContext)[name]
  return key ? t(key) : undefined
}

interface BaseProps {
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

/** A date: typed or picked from a calendar; posts `YYYY-MM-DD`. */
export function DateField({
  name,
  label,
  help,
  required,
  defaultValue,
  min,
  max,
}: BaseProps & {
  defaultValue?: string | null | undefined
  min?: string | undefined
  max?: string | undefined
}) {
  const error = useFieldError(name)
  const t = useTranslations('forms.picker')
  const locale = useLocale()
  return (
    <Field label={label} help={help} error={error} required={required}>
      {props => (
        <DatePicker
          name={name}
          defaultValue={defaultValue ?? ''}
          min={min}
          max={max}
          today={todayIn()}
          locale={locale}
          labels={{
            open: t('chooseDate', { field: label }),
            previousMonth: t('previousMonth'),
            nextMonth: t('nextMonth'),
            previousYear: t('previousYear'),
            nextYear: t('nextYear'),
            today: t('today'),
            clear: t('clear'),
          }}
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
}: BaseProps & { defaultValue?: string | null | undefined }) {
  const error = useFieldError(name)
  const t = useTranslations('forms.picker')
  return (
    <Field label={label} help={help} error={error} required={required}>
      {props => (
        <TimePicker
          name={name}
          defaultValue={defaultValue ?? ''}
          labels={{
            open: t('chooseTime', { field: label }),
            hours: t('hours'),
            minutes: t('minutes'),
          }}
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
