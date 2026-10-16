import type { ArchivedField } from '@muni/db/repositories'
import { formatDate, formatDateTime, PLACEHOLDER } from '@muni/utils/format'
import { useLocale } from 'next-intl'

/** A field of an archived record, formatted by its type. */
export function ArchivedValue({ field }: { field: ArchivedField }) {
  const locale = useLocale()
  const { value, type } = field
  if (value === null || value === '') return PLACEHOLDER
  if (type === 'date') return formatDate(String(value), locale)
  if (type === 'datetime') return formatDateTime(String(value), locale)
  return String(value)
}
