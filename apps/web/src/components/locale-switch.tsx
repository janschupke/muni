'use client'

import { SegmentedControl } from '@muni/ui/segmented-control'
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
    <SegmentedControl
      label={groupLabel}
      value={current}
      disabled={pending}
      onValueChange={locale => {
        startTransition(() => setLocale(locale))
      }}
      items={LOCALES.map(locale => ({
        value: locale,
        label: labels[locale],
        content: (
          <span lang={locale} className="uppercase">
            {locale}
          </span>
        ),
      }))}
    />
  )
}
