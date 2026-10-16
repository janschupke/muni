import { ClerkProvider } from '@clerk/nextjs'
import { csCZ, enUS } from '@clerk/localizations'
import { TooltipProvider } from '@muni/ui/tooltip'
import { THEME_BOOT_SCRIPT } from '@muni/ui/theme/boot'
import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { AppHeader } from '@/components/app-header'
import { getViewer } from '@/server/auth'
import { clerkEnabled } from '@/server/clerk'

import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: { default: t('title'), template: `%s · ${t('title')}` },
    description: t('description'),
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, viewer] = await Promise.all([getLocale(), getViewer()])

  const page = (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <TooltipProvider>
            <AppHeader viewer={viewer} />
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )

  if (!clerkEnabled) return page
  return (
    <ClerkProvider
      localization={locale === 'cs' ? csCZ : enUS}
      signInUrl="/sign-in"
      afterSignOutUrl="/"
    >
      {page}
    </ClerkProvider>
  )
}
