'use client'

import type { ValidationIssue } from '@muni/importer'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

/** Translates importer issues and column keys. Codes and params come from @muni/importer. */
export function useImportText() {
  const t = useTranslations('import')
  const fieldLabel = useCallback(
    (field: string) => {
      const key = `fields.${field}`
      return t.has(key as 'fields.row') ? t(key as 'fields.row') : field
    },
    [t]
  )
  const issueText = useCallback(
    (issue: ValidationIssue) => t(`issues.${issue.code}`, issue.params ?? {}),
    [t]
  )
  return { t, fieldLabel, issueText }
}
