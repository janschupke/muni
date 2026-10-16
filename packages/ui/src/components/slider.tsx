'use client'

import { Slider as SliderPrimitive } from 'radix-ui'
import { useId, type ReactNode } from 'react'

import { cn } from '../cn'

/**
 * A labelled single-value slider with its current value printed next to the label
 * (the value is never conveyed by the thumb position alone).
 */
export function Slider({
  label,
  value,
  onValueChange,
  min,
  max,
  step,
  format = String,
  help,
  className,
}: {
  label: ReactNode
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  step: number
  /** How the printed value reads ("40 %", "0.5 / day"). */
  format?: (value: number) => string
  help?: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label id={`${id}-label`} className="font-medium text-fg">
          {label}
        </label>
        <output htmlFor={`${id}-thumb`} className="text-fg-muted tabular-nums">
          {format(value)}
        </output>
      </div>
      <SliderPrimitive.Root
        value={[value]}
        onValueChange={([next]) => {
          if (next !== undefined) onValueChange(next)
        }}
        min={min}
        max={max}
        step={step}
        className="relative flex h-5 w-full touch-none items-center select-none"
      >
        <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-chart-track">
          <SliderPrimitive.Range className="absolute h-full bg-accent" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          id={`${id}-thumb`}
          aria-labelledby={`${id}-label`}
          aria-valuetext={format(value)}
          aria-describedby={help ? `${id}-help` : undefined}
          className="block size-4 rounded-full border-2 border-accent bg-surface-elevated shadow-card transition-transform hover:scale-110 focus-visible:scale-110"
        />
      </SliderPrimitive.Root>
      {help && (
        <p id={`${id}-help`} className="text-xs text-fg-subtle">
          {help}
        </p>
      )}
    </div>
  )
}
