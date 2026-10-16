import { describe, expect, it } from 'vitest'

import { resolveLocale } from './locales'

describe('resolveLocale', () => {
  it('prefers the cookie, then Accept-Language, then Czech', () => {
    expect(resolveLocale('en', 'cs-CZ')).toBe('en')
    expect(resolveLocale(undefined, 'en-GB,en;q=0.9')).toBe('en')
    expect(resolveLocale('xx', 'de-DE,cs;q=0.5')).toBe('cs')
    expect(resolveLocale(undefined, null)).toBe('cs')
  })
})
