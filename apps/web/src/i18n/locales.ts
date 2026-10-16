export const LOCALES = ['cs', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'cs'
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** Cookie first, then the browser's Accept-Language, then Czech. */
export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().slice(0, 2)
    if (isLocale(tag)) return tag
  }
  return DEFAULT_LOCALE
}

/** The language cookie's value in a `document.cookie` string, if it is set. */
export function localeCookieIn(cookies: string): string | undefined {
  for (const part of cookies.split(';')) {
    const [name, value] = part.trim().split('=')
    if (name === LOCALE_COOKIE) return value
  }
  return undefined
}
