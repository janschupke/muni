import { APP_TIME_ZONE } from '@muni/utils/dates'
import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

import { LOCALE_COOKIE, resolveLocale } from './locales'
import cs from './messages/cs.json'
import en from './messages/en.json'

const MESSAGES = { cs, en }

// No locale in the URL: the choice lives in a cookie (set by the header switch).
export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get('accept-language')
  )
  return { locale, messages: MESSAGES[locale], timeZone: APP_TIME_ZONE }
})
