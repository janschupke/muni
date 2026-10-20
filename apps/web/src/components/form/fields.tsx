'use client'

import { Checkbox } from '@muni/ui/checkbox'
import { DatePicker } from '@muni/ui/date-picker'
import { Field, Fieldset, Input, Textarea } from '@muni/ui/field'
import { Select } from '@muni/ui/select'
import { TimePicker } from '@muni/ui/time-picker'
import { todayIn } from '@muni/utils/dates'
import { PLACEHOLDER } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { type InputHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react'

import { useField } from './form-context'
import { useDateLabels, useTimeLabels } from './picker-labels'

// The fields a FormShell tracks: each marks itself (`data-field`) and shows its state there.

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
