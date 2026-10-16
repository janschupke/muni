'use client'

import { Check, ChevronDown } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'
import { useState, type ReactNode } from 'react'

import { cn } from '../cn'
import { controlClass } from './field'

export interface SelectOption {
  value: string
  label: ReactNode
  disabled?: boolean | undefined
}

// Radix reserves '' (it clears the selection), so the "none" option carries this value inside
// the listbox. It never leaves the component: callers and form posts see ''.
const EMPTY = '__muni_select_empty__'

/**
 * A listbox select (Radix). `''` means no value, as with a native select: pass `emptyLabel`
 * to offer it as an option ("Any", "None"), otherwise it shows `placeholder`.
 *
 * With `name` it posts through a hidden input, so it works in plain forms and server actions.
 * It accepts the props `Field` hands its control (`id`, `aria-describedby`, `aria-invalid`).
 */
export function Select({
  options,
  value,
  defaultValue = '',
  onValueChange,
  name,
  placeholder,
  emptyLabel,
  disabled,
  required,
  id,
  className,
  size = 'md',
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  'aria-label': ariaLabel,
}: {
  options: readonly SelectOption[]
  value?: string | undefined
  defaultValue?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
  name?: string | undefined
  placeholder?: ReactNode | undefined
  emptyLabel?: ReactNode | undefined
  disabled?: boolean | undefined
  required?: boolean | undefined
  id?: string | undefined
  className?: string | undefined
  size?: 'md' | 'sm' | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
  'aria-label'?: string | undefined
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const current = value ?? uncontrolled
  const hasEmptyOption = emptyLabel !== undefined

  return (
    <>
      <SelectPrimitive.Root
        value={current === '' ? (hasEmptyOption ? EMPTY : '') : current}
        onValueChange={next => {
          const plain = next === EMPTY ? '' : next
          if (value === undefined) setUncontrolled(plain)
          onValueChange?.(plain)
        }}
        disabled={disabled}
        required={required}
      >
        <SelectPrimitive.Trigger
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-label={ariaLabel}
          className={cn(
            controlClass,
            'flex items-center justify-between gap-2 text-left transition-colors data-[placeholder]:text-fg-subtle',
            size === 'md' ? 'h-9 py-0' : 'h-8 py-0',
            className
          )}
        >
          <span className="truncate">
            <SelectPrimitive.Value placeholder={placeholder} />
          </span>
          <SelectPrimitive.Icon asChild>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-fg-muted" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-hidden rounded-md border border-border-default bg-surface-overlay text-sm text-fg shadow-overlay data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
          >
            <SelectPrimitive.Viewport className="p-1">
              {hasEmptyOption && <SelectItem value={EMPTY}>{emptyLabel}</SelectItem>}
              {options.map(option => (
                <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {name !== undefined && <input type="hidden" name={name} value={current} />}
    </>
  )
}

function SelectItem({
  value,
  disabled,
  children,
}: {
  value: string
  disabled?: boolean | undefined
  children: ReactNode
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      disabled={disabled}
      className="relative flex cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 transition-colors outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-state-hover"
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center">
        <Check aria-hidden className="size-4 text-accent-text" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}
