import { cva, type VariantProps } from 'class-variance-authority'
import {
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from 'react'

import { cn } from '../cn'

/** Shared by Input, Textarea and the Select trigger. */
export const controlClass =
  'w-full rounded-md border border-border-control bg-control px-3 py-2 text-sm text-fg placeholder:text-fg-subtle hover:border-fg-muted aria-invalid:border-danger-fill aria-invalid:focus-visible:outline-danger-fill disabled:cursor-not-allowed disabled:border-border-default disabled:bg-transparent disabled:text-fg-muted'

/**
 * Label, control, help and error. The label wraps nothing: help and error are linked with
 * aria-describedby so they don't leak into the control's accessible name.
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
}: {
  label: ReactNode
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
          required && "after:ml-0.5 after:text-danger-fg after:content-['*']"
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
