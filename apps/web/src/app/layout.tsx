import { ClerkProvider } from '@clerk/nextjs'
import { csCZ, enUS } from '@clerk/localizations'
import { Container } from '@muni/ui/layout'
import { TooltipProvider } from '@muni/ui/tooltip'
import { THEME_BOOT_SCRIPT } from '@muni/ui/theme/boot'
import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { AppFooter } from '@/components/app-footer'
import { AppHeader } from '@/components/app-header'
import { NavigationHistory } from '@/components/navigation-history'
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
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider>
          <TooltipProvider>
            <AppHeader viewer={viewer} />
            <NavigationHistory>
              <Container asChild className="flex-1 py-8">
                <main>{children}</main>
              </Container>
            </NavigationHistory>
            <AppFooter viewer={viewer} />
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
