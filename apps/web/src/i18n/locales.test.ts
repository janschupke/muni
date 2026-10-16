import { describe, expect, it } from 'vitest'

import { localeCookieIn, resolveLocale } from './locales'

describe('resolveLocale', () => {
  it('prefers the cookie, then Accept-Language, then Czech', () => {
    expect(resolveLocale('en', 'cs-CZ')).toBe('en')
    expect(resolveLocale(undefined, 'en-GB,en;q=0.9')).toBe('en')
    expect(resolveLocale('xx', 'de-DE,cs;q=0.5')).toBe('cs')
    expect(resolveLocale(undefined, null)).toBe('cs')
  })
})

describe('localeCookieIn', () => {
  it('reads the language cookie out of document.cookie', () => {
    expect(localeCookieIn('a=1; NEXT_LOCALE=cs; b=2')).toBe('cs')
    expect(localeCookieIn('XNEXT_LOCALE=en')).toBeUndefined()
    expect(localeCookieIn('')).toBeUndefined()
  })
})
