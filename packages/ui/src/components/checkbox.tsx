'use client'

import { Check } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { useId, type ReactNode } from 'react'

/**
 * A labelled checkbox (Radix). Inside a form it posts `name=on` when checked, like a native
 * checkbox, and nothing when unchecked.
 */
export function Checkbox({
  label,
  name,
  defaultChecked,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: ReactNode
  name?: string
  defaultChecked?: boolean
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <CheckboxPrimitive.Root
        id={id}
        name={name}
        defaultChecked={defaultChecked}
        checked={checked}
        onCheckedChange={state => onCheckedChange?.(state === true)}
        disabled={disabled}
        className="flex size-4 shrink-0 items-center justify-center rounded-sm border border-border-emphasis bg-surface-elevated text-accent-fg disabled:opacity-60 data-[state=checked]:border-accent data-[state=checked]:bg-accent"
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
