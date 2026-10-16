'use client'

import './globals.css'

import { AppFailure, appFailureLocale } from '@/components/app-failure'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang={appFailureLocale()}>
      <body className="flex min-h-dvh items-center justify-center bg-surface-base p-6 text-fg">
        <AppFailure error={error} reset={reset} />
      </body>
    </html>
  )
}
