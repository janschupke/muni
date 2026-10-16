'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

import { SegmentedControl } from '../components/segmented-control'
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

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const

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
    <SegmentedControl
      label={groupLabel}
      value={choice}
      onValueChange={value => {
        setChoice(value)
        apply(value)
      }}
      items={(['light', 'dark', 'system'] as const).map(value => {
        const Icon = ICONS[value]
        return { value, label: labels[value], content: <Icon aria-hidden /> }
      })}
    />
  )
}
