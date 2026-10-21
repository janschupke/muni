'use server'

import { cookies } from 'next/headers'

import { isLocale, LOCALE_COOKIE } from '@/i18n/locales'

/**
 * Stores the chosen language. A cookie set in a server action makes Next render the current
 * page again for this browser; nothing shared is revalidated (anyone may call this, signed in
 * or not).
 */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
}
