// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { Providers } from '@/test/render'

import { useImportText } from './use-issue-text'

const wrapper = ({ children }: { children: ReactNode }) => <Providers>{children}</Providers>

describe('useImportText', () => {
  it('names a known column by its label and any other by its key', () => {
    const { result } = renderHook(() => useImportText(), { wrapper })
    expect(result.current.fieldLabel('firstName')).toBe('First name')
    expect(result.current.fieldLabel('barva')).toBe('barva')
  })

  it('words an issue with the values it carries, or none', () => {
    const { result } = renderHook(() => useImportText(), { wrapper })
    expect(result.current.issueText({ field: 'row', code: 'SUMMARY_ROW', severity: 'error' })).toBe(
      'Totals row, not a record.'
    )
    expect(
      result.current.issueText({
        field: 'completedOn',
        code: 'INVALID_DATE',
        severity: 'error',
        params: { raw: '31.02.2026' },
      })
    ).toBe('“31.02.2026” is not a valid date.')
  })
})
