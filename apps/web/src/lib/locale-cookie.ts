/** The language the `NEXT_LOCALE` cookie asks for, where next-intl is not available. */
export function localeOfCookie(cookie: string): 'cs' | 'en' {
  return /(?:^|;\s*)NEXT_LOCALE=cs(?:;|$)/.test(cookie) ? 'cs' : 'en'
}
