'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { SegmentedControl } from '../components/segmented-control'
import { THEME_STORAGE_KEY, type ThemeChoice } from './boot'

// The choice lives on <html data-theme> (the boot script sets it before first paint), so the
// toggle reads it from there: right on the first client render, and the same in every toggle.
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function currentChoice(): ThemeChoice {
  const theme = document.documentElement.dataset['theme']
  return theme === 'light' || theme === 'dark' ? theme : 'system'
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.dataset['theme'] = choice
  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  for (const listener of listeners) listener()
}

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const

/** Three-way light / dark / system switch. Labels come from the app (i18n). */
export function ThemeToggle({
  labels,
  groupLabel,
}: {
  labels: Record<ThemeChoice, string>
  groupLabel: string
}) {
  const choice = useSyncExternalStore(subscribe, currentChoice, () => 'system' as const)
  return (
    <SegmentedControl
      label={groupLabel}
      value={choice}
      onValueChange={apply}
      items={(['light', 'dark', 'system'] as const).map(value => {
        const Icon = ICONS[value]
        return { value, label: labels[value], content: <Icon aria-hidden /> }
      })}
    />
  )
}
