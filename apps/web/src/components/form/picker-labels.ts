'use client'

import type { DatePickerLabels } from '@muni/ui/date-picker'
import type { TimePickerLabels } from '@muni/ui/time-picker'
import { useTranslations } from 'next-intl'

// What the date and time pickers say, in every form and the planner's review.

/** The date picker's words, for the field named `field`. */
export function useDateLabels(): (field: string) => DatePickerLabels {
  const t = useTranslations('forms.picker')
  return field => ({
    open: t('chooseDate', { field }),
    previousMonth: t('previousMonth'),
    nextMonth: t('nextMonth'),
    previousYear: t('previousYear'),
    nextYear: t('nextYear'),
    today: t('today'),
    clear: t('clear'),
    format: { day: t('format.day'), month: t('format.month'), year: t('format.year') },
  })
}

/** The time picker's words, for the field named `field`. */
export function useTimeLabels(): (field: string) => TimePickerLabels {
  const t = useTranslations('forms.picker')
  return field => ({ open: t('chooseTime', { field }), hours: t('hours'), minutes: t('minutes') })
}
