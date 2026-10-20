import { cva, type VariantProps } from 'class-variance-authority'
import {
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from 'react'

import { cn } from '../../cn'
import { controlClass } from './control-class'

/**
 * Label, control, help and error. The label wraps nothing: help and error are linked with
 * aria-describedby so they don't leak into the control's accessible name.
 *
 * `hideLabel` keeps the label for assistive technology only: for a control in a table row,
 * whose column header names it for sighted users.
 *
 * In a form that tracks its fields, `name` marks the field (`data-field`) and `dirty` /
 * `touched` say whether it changed or was visited (`data-dirty`, `data-touched`); with
 * `data-invalid` they are there for styles and tests.
 */
export function Field({
  label,
  help,
  error,
  required,
  name,
  dirty,
  touched,
  children,
  className,
  hideLabel = false,
}: {
  label: ReactNode
  hideLabel?: boolean | undefined
  help?: ReactNode | undefined
  error?: ReactNode | undefined
  required?: boolean | undefined
  name?: string | undefined
  dirty?: boolean | undefined
  touched?: boolean | undefined
  children: (props: {
    id: string
    'aria-describedby'?: string | undefined
    'aria-invalid'?: boolean | undefined
    required?: boolean | undefined
  }) => ReactNode
  className?: string | undefined
}) {
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy =
    [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div
      data-field={name}
      data-dirty={dirty ? true : undefined}
      data-touched={touched ? true : undefined}
      data-invalid={error ? true : undefined}
      className={cn('flex flex-col gap-1.5', className)}
    >
      <label
        htmlFor={id}
        className={cn(
          'text-sm font-medium text-fg',
          required && "after:ml-0.5 after:text-danger-fg after:content-['*']",
          hideLabel && 'sr-only'
        )}
      >
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required,
      })}
      {Boolean(help) && (
        <p id={helpId} className="text-xs text-fg-muted">
          {help}
        </p>
      )}
      {Boolean(error) && (
        <p id={errorId} aria-live="polite" className="text-xs text-danger-fg">
          {error}
        </p>
      )}
    </div>
  )
}

const inputClass = cva(controlClass, {
  variants: {
    size: {
      md: 'h-9',
      sm: 'h-8 py-1',
      /** Borderless editor that fills a table cell. */
      cell: 'h-auto min-w-24 rounded-none border-0 px-2 py-1.5 text-xs outline-2 outline-focus-ring',
    },
  },
  defaultVariants: { size: 'md' },
})

export function Input({
  className,
  size,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & VariantProps<typeof inputClass>) {
  return <input className={cn(inputClass({ size }), className)} {...props} />
}

/**
 * A value the form works out from other fields (a session's end, its price), in a field's
 * place: labelled, with its help and error, at an input's height, but plainly not typed in. An
 * `<output>`, so a screen reader hears it change as the fields it follows do.
 */
export function FieldValue({
  label,
  help,
  error,
  children,
  className,
}: {
  label: ReactNode
  help?: ReactNode | undefined
  error?: ReactNode | undefined
  children: ReactNode
  className?: string | undefined
}) {
  return (
    <Field label={label} help={help} error={error} className={className}>
      {props => (
        <output
          id={props.id}
          aria-describedby={props['aria-describedby']}
          className="flex min-h-9 items-center text-sm text-fg tabular-nums"
        >
          {children}
        </output>
      )}
    </Field>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, 'min-h-20', className)} {...props} />
}

/** Fields side by side from `sm`, stacked on phones. */
export function FieldRow({ columns = 2, children }: { columns?: 2 | 3; children: ReactNode }) {
  return (
    <div className={cn('grid gap-4', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {children}
    </div>
  )
}

/** Quiet explanatory text next to a control or above a table. */
export function Hint({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-fg-subtle', className)} {...props} />
}

/**
 * A group of controls under one label (checkboxes that post one name): the legend names the
 * group, its help and error are linked to it like a field's, and it carries the same state
 * attributes a Field does.
 */
export function Fieldset({
  legend,
  help,
  error,
  name,
  dirty,
  touched,
  children,
  className,
}: {
  legend: ReactNode
  help?: ReactNode | undefined
  error?: ReactNode | undefined
  name?: string | undefined
  dirty?: boolean | undefined
  touched?: boolean | undefined
  children: ReactNode
  className?: string | undefined
}) {
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy =
    [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <fieldset
      data-field={name}
      data-dirty={dirty ? true : undefined}
      data-touched={touched ? true : undefined}
      data-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={cn('flex flex-col gap-2', className)}
    >
      <legend className="mb-1 text-sm font-medium text-fg">{legend}</legend>
      {Boolean(help) && (
        <p id={helpId} className="-mt-1 text-xs text-fg-muted">
          {help}
        </p>
      )}
      {children}
      {Boolean(error) && (
        <p id={errorId} aria-live="polite" className="text-xs text-danger-fg">
          {error}
        </p>
      )}
    </fieldset>
  )
}
