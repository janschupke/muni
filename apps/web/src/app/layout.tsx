import './globals.css'

import { csCZ, enUS } from '@clerk/localizations'
import { ClerkProvider } from '@clerk/nextjs'
import { Container } from '@muni/ui/layout'
import { THEME_BOOT_SCRIPT } from '@muni/ui/theme/boot'
import { TooltipProvider } from '@muni/ui/tooltip'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { type Messages, NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { AppFooter } from '@/components/app-footer'
import { AppShell } from '@/components/app-shell'
import { NavigationHistory } from '@/components/navigation-history'
import { QueryProvider } from '@/components/query-provider'
import { ToastsProvider } from '@/components/toasts'
import { getSessionUser } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: { default: t('title'), template: `%s · ${t('title')}` },
    description: t('description'),
  }
}

/**
 * What the browser needs translated before anyone signs in: the shell's own words (the
 * landing and the sign-in pages are rendered on the server). Signed in, every page's views
 * are in the browser, and they use nearly the whole catalog.
 */
const SIGNED_OUT = ['common', 'errors', 'back', 'nav'] as const
const signedOut = (messages: Messages) =>
  Object.fromEntries(SIGNED_OUT.map(namespace => [namespace, messages[namespace]]))

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, user, t, requestHeaders, messages] = await Promise.all([
    getLocale(),
    getSessionUser(),
    getTranslations('common'),
    headers(),
    getMessages(),
  ])
  // The Content-Security-Policy's nonce (set per request by the proxy): the one inline script
  // here carries it, as Next's and Clerk's do.
  const nonce = requestHeaders.get('x-nonce') ?? undefined

  return (
    <ClerkProvider
      dynamic
      localization={locale === 'cs' ? csCZ : enUS}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <html lang={locale} suppressHydrationWarning>
        <head>
          {/* Applies the stored theme before first paint: a constant, never data. */}
          {/* eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml */}
          <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        </head>
        <body className="min-h-dvh">
          <NextIntlClientProvider messages={user ? messages : signedOut(messages)}>
            {/* One read cache per user and role: another account never sees this one's data. */}
            <QueryProvider scope={user ? `${user.id}:${user.role}` : 'anon'}>
              <TooltipProvider>
                <ToastsProvider>
                  <a
                    href="#main"
                    className="sr-only rounded-md bg-surface-overlay px-4 py-2 text-sm font-medium text-fg shadow-overlay focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
                  >
                    {t('skipToContent')}
                  </a>
                  <AppShell user={user}>
                    <NavigationHistory>
                      <Container asChild className="flex-1 py-6 lg:py-8">
                        <main id="main" tabIndex={-1} className="outline-none">
                          {children}
                        </main>
                      </Container>
                    </NavigationHistory>
                    <AppFooter user={user} />
                  </AppShell>
                </ToastsProvider>
              </TooltipProvider>
            </QueryProvider>
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
