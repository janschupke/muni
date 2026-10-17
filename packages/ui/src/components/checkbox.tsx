'use client'

import { Check } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { type ReactNode, useId } from 'react'

/**
 * A labelled checkbox (Radix). Inside a form it posts `name=value` (`on` by default) when
 * checked, like a native checkbox, and nothing when unchecked.
 */
export function Checkbox({
  label,
  name,
  value,
  defaultChecked,
  checked,
  onCheckedChange,
  disabled,
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
}: {
  label: ReactNode
  name?: string | undefined
  /** Posted when checked (default `on`); a group posts one value per checked box. */
  value?: string | undefined
  defaultChecked?: boolean | undefined
  checked?: boolean | undefined
  onCheckedChange?: ((checked: boolean) => void) | undefined
  disabled?: boolean | undefined
  'aria-invalid'?: boolean | undefined
  'aria-describedby'?: string | undefined
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <CheckboxPrimitive.Root
        id={id}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        checked={checked}
        onCheckedChange={state => onCheckedChange?.(state === true)}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="flex size-4 shrink-0 items-center justify-center rounded-sm border border-border-emphasis bg-control text-accent-fg disabled:opacity-60 aria-invalid:border-danger-fill data-[state=checked]:border-accent data-[state=checked]:bg-accent"
      >
        <CheckboxPrimitive.Indicator>
          <Check aria-hidden className="size-3" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
    </div>
  )
}
