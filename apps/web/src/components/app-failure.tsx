'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { DEFAULT_LOCALE, localeCookieIn, resolveLocale, type Locale } from '@/i18n/locales'

// The root layout itself failed, so there is no frame and no translations: the language is
// resolved here the way the app does it (cookie, then the browser, then Czech).
const TEXT = {
  en: {
    title: 'Something went wrong',
    body: 'The application could not start. Trying again often helps; if it keeps failing, report the reference below.',
    reference: 'Reference',
    retry: 'Try again',
  },
  cs: {
    title: 'Něco se pokazilo',
    body: 'Aplikaci se nepodařilo spustit. Často pomůže zkusit to znovu; pokud chyba trvá, nahlaste níže uvedený kód.',
    reference: 'Kód chyby',
    retry: 'Zkusit znovu',
  },
} as const

const noSubscription = () => () => undefined

/**
 * The visitor's language. The server knows no cookie here, so it renders Czech; the client
 * then reads the cookie and the browser's languages without a hydration mismatch.
 */
export function useFailureLocale(): Locale {
  return useSyncExternalStore(
    noSubscription,
    () => resolveLocale(localeCookieIn(document.cookie), navigator.languages.join(',')),
    () => DEFAULT_LOCALE
  )
}

/** What `global-error.tsx` shows inside its own document. */
export function AppFailure({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const text = TEXT[useFailureLocale()]
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main className="flex max-w-lg flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">{text.title}</h1>
      <p className="text-fg-muted">{text.body}</p>
      {error.digest && (
        <code className="text-xs text-fg-muted">
          {text.reference}: {error.digest}
        </code>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
      >
        {text.retry}
      </button>
    </main>
  )
}
