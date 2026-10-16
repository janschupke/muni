import './globals.css'

import { csCZ, enUS } from '@clerk/localizations'
import { ClerkProvider } from '@clerk/nextjs'
import { Container } from '@muni/ui/layout'
import { THEME_BOOT_SCRIPT } from '@muni/ui/theme/boot'
import { TooltipProvider } from '@muni/ui/tooltip'
import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { AppFooter } from '@/components/app-footer'
import { AppShell } from '@/components/app-shell'
import { NavigationHistory } from '@/components/navigation-history'
import { getViewer } from '@/server/auth'
import { clerkEnabled } from '@/server/clerk'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: { default: t('title'), template: `%s · ${t('title')}` },
    description: t('description'),
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, viewer, t] = await Promise.all([
    getLocale(),
    getViewer(),
    getTranslations('common'),
  ])

  const page = (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <TooltipProvider>
            <a
              href="#main"
              className="sr-only rounded-md bg-surface-overlay px-4 py-2 text-sm font-medium text-fg shadow-overlay focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
            >
              {t('skipToContent')}
            </a>
            <AppShell viewer={viewer}>
              <NavigationHistory>
                <Container asChild className="flex-1 py-6 lg:py-8">
                  <main id="main" tabIndex={-1} className="outline-none">
                    {children}
                  </main>
                </Container>
              </NavigationHistory>
              <AppFooter viewer={viewer} />
            </AppShell>
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
