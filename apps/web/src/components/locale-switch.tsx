'use client'

import { useTransition } from 'react'

import { LOCALES, type Locale } from '@/i18n/locales'
import { setLocale } from '@/server/actions/locale'

export function LocaleSwitch({
  current,
  labels,
  groupLabel,
}: {
  current: Locale
  labels: Record<Locale, string>
  groupLabel: string
}) {
  const [pending, startTransition] = useTransition()
  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      className="flex rounded-md border border-border-default p-0.5"
    >
      {LOCALES.map(locale => (
        <button
          key={locale}
          type="button"
          role="radio"
          aria-checked={locale === current}
          aria-label={labels[locale]}
          title={labels[locale]}
          disabled={pending}
          onClick={() => {
            startTransition(() => setLocale(locale))
          }}
          className="h-7 rounded-sm px-2 text-xs font-semibold text-fg-muted uppercase hover:text-fg aria-checked:bg-state-selected aria-checked:text-fg"
        >
          <span lang={locale}>{locale}</span>
        </button>
      ))}
    </div>
  )
}
