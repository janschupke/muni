'use client'

import './globals.css'

import { AppFailure, useFailureLocale } from '@/components/shell/app-failure'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const locale = useFailureLocale()
  return (
    <html lang={locale}>
      <body className="flex min-h-dvh items-center justify-center bg-surface-base p-6 text-fg">
        <AppFailure error={error} reset={reset} />
      </body>
    </html>
  )
}
