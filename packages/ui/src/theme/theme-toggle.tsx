'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '../cn'
import { THEME_STORAGE_KEY, type ThemeChoice } from './boot'

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
}

const OPTIONS = [
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
  { value: 'system', Icon: Monitor },
] as const

/** Three-way light / dark / system switch. Labels come from the app (i18n). */
export function ThemeToggle({
  labels,
  groupLabel,
}: {
  labels: Record<ThemeChoice, string>
  groupLabel: string
}) {
  const [choice, setChoice] = useState<ThemeChoice>('system')
  useEffect(() => {
    // Sync with the value the boot script already applied.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(readChoice())
  }, [])

  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      className="flex rounded-md border border-border-default p-0.5"
    >
      {OPTIONS.map(({ value, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          aria-label={labels[value]}
          title={labels[value]}
          onClick={() => {
            setChoice(value)
            apply(value)
          }}
          className={cn(
            'flex size-7 items-center justify-center rounded-sm text-fg-muted hover:text-fg',
            choice === value && 'bg-state-selected text-fg'
          )}
        >
          <Icon aria-hidden className="size-4" />
        </button>
      ))}
    </div>
  )
}
