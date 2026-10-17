'use client'

import { SegmentedControl } from '@muni/ui/segmented-control'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'

import { type Locale, LOCALES } from '@/i18n/locales'
import { setLocale } from '@/server/actions/locale'

import { useToast } from './toasts'

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
  const toast = useToast()
  const failed = useTranslations('common')('failed')
  return (
    <SegmentedControl
      label={groupLabel}
      value={current}
      disabled={pending}
      onValueChange={locale => {
        startTransition(async () => {
          try {
            await setLocale(locale)
          } catch {
            toast({ tone: 'danger', title: failed })
          }
        })
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
