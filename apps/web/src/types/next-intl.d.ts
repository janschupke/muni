import type en from '../i18n/messages/en.json'
import type { Locale } from '../i18n/locales'

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: typeof en
  }
}
