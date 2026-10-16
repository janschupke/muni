'use client'

import {
  ADVISOR_LIMITS,
  DEFAULT_ADVISOR_SETTINGS,
  type AdvisorNumberSetting,
  type AdvisorSettings,
} from '@muni/domain/advisor'
import { Button } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { Checkbox } from '@muni/ui/checkbox'
import { Hint } from '@muni/ui/field'
import { Slider } from '@muni/ui/slider'
import { formatDecimal } from '@muni/utils/format'
import { RotateCcw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

const GROUPS: { key: 'urgency' | 'choice' | 'limits'; settings: AdvisorNumberSetting[] }[] = [
  {
    key: 'urgency',
    settings: ['weightExpired', 'weightMissing', 'weightExpiring', 'expiringRamp'],
  },
  { key: 'choice', settings: ['waitPenalty', 'lateAfterExpiryPenalty', 'fillPreference'] },
  { key: 'limits', settings: ['maxFill', 'horizonDays', 'maxPerEmployee'] },
]

/** The adjustable weights and limits, each with what it does in one line. */
export function Calculator({
  settings,
  onChange,
}: {
  settings: AdvisorSettings
  onChange: (settings: AdvisorSettings) => void
}) {
  const t = useTranslations('advisor.settings')
  const locale = useLocale()
  const isDefault = (Object.keys(DEFAULT_ADVISOR_SETTINGS) as (keyof AdvisorSettings)[]).every(
    key => settings[key] === DEFAULT_ADVISOR_SETTINGS[key]
  )

  const format = (key: AdvisorNumberSetting, value: number) => {
    const number = formatDecimal(value, locale, { digits: 1, signed: key === 'fillPreference' })
    switch (key) {
      case 'expiringRamp':
      case 'waitPenalty':
        return t('units.perDay', { value: number })
      case 'maxFill':
        return t('units.percent', { value: number })
      case 'horizonDays':
        return t('units.days', { count: value })
      case 'maxPerEmployee':
        return t('units.sessions', { count: value })
      default:
        return t('units.points', { value: number })
    }
  }

  return (
    <Card>
      <CardHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={isDefault}
            onClick={() => {
              onChange(DEFAULT_ADVISOR_SETTINGS)
            }}
          >
            <RotateCcw aria-hidden />
            {t('reset')}
          </Button>
        }
      />
      <CardBody className="flex flex-col gap-6">
        {GROUPS.map(group => (
          <fieldset key={group.key} className="flex flex-col gap-4">
            <legend className="mb-3 text-xs font-semibold tracking-wide text-fg-muted uppercase">
              {t(`groups.${group.key}`)}
            </legend>
            {group.settings.map(key => {
              const limits = ADVISOR_LIMITS[key]
              return (
                <Slider
                  key={key}
                  label={t(`fields.${key}.label`)}
                  help={t(`fields.${key}.help`)}
                  value={settings[key]}
                  min={limits.min}
                  max={limits.max}
                  step={limits.step}
                  format={value => format(key, value)}
                  onValueChange={value => {
                    onChange({ ...settings, [key]: value })
                  }}
                />
              )
            })}
          </fieldset>
        ))}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-3 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            {t('groups.scope')}
          </legend>
          <Checkbox
            label={t('fields.includeExpiring')}
            checked={settings.includeExpiring}
            onCheckedChange={includeExpiring => {
              onChange({ ...settings, includeExpiring })
            }}
          />
          <Checkbox
            label={t('fields.includeParentalLeave')}
            checked={settings.includeParentalLeave}
            onCheckedChange={includeParentalLeave => {
              onChange({ ...settings, includeParentalLeave })
            }}
          />
        </fieldset>
      </CardBody>
    </Card>
  )
}

/** The ranking rule in words, with the numbers currently set. */
export function Formula({ settings, window }: { settings: AdvisorSettings; window: number }) {
  const t = useTranslations('advisor.formula')
  const locale = useLocale()
  const n = (value: number) => formatDecimal(value, locale)
  return (
    <Card>
      <CardHeader title={t('title')} />
      <CardBody className="flex flex-col gap-2 text-sm">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>
            {t('priority', {
              expired: n(settings.weightExpired),
              missing: n(settings.weightMissing),
              expiring: n(settings.weightExpiring),
              ramp: n(settings.expiringRamp),
              window,
            })}
          </li>
          <li>{t('order')}</li>
          <li>
            {t('score', {
              wait: n(settings.waitPenalty),
              late: n(settings.lateAfterExpiryPenalty),
              fill: formatDecimal(settings.fillPreference, locale, { signed: true }),
            })}
          </li>
          <li>
            {t('limits', {
              maxFill: n(settings.maxFill),
              horizon: settings.horizonDays,
              perPerson: settings.maxPerEmployee,
            })}
          </li>
          <li>{t('overbooking')}</li>
        </ol>
        <Hint>{t('note')}</Hint>
      </CardBody>
    </Card>
  )
}
