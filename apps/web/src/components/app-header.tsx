import { SignInButton, UserButton } from '@clerk/nextjs'
import { buttonClass } from '@muni/ui/button'
import { ThemeToggle } from '@muni/ui/theme/theme-toggle'
import { GraduationCap } from 'lucide-react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { clerkEnabled } from '@/server/clerk'
import type { Viewer } from '@muni/domain/enums'

import { LocaleSwitch } from './locale-switch'
import { NavLink } from './nav-link'

export async function AppHeader({ viewer }: { viewer: Viewer }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()])
  const links = [
    { href: '/', label: t('nav.dashboard') },
    { href: '/employees', label: t('nav.employees') },
    { href: '/courses', label: t('nav.courses') },
    { href: '/sessions', label: t('nav.sessions') },
    { href: '/compliance', label: t('nav.compliance') },
    ...(viewer === 'authenticated' ? [{ href: '/import', label: t('nav.import') }] : []),
  ]

  return (
    <header className="sticky top-0 z-30 border-b border-border-default bg-surface-elevated/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-fg">
          <GraduationCap aria-hidden className="size-5 text-accent-text" />
          {t('common.appName')}
        </Link>
        <nav
          aria-label={t('nav.primary')}
          className="order-last -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto"
        >
          {links.map(link => (
            <NavLink key={link.href} href={link.href}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitch
            current={locale}
            groupLabel={t('nav.language.label')}
            labels={{ cs: t('nav.language.cs'), en: t('nav.language.en') }}
          />
          <ThemeToggle
            groupLabel={t('nav.theme.label')}
            labels={{
              light: t('nav.theme.light'),
              dark: t('nav.theme.dark'),
              system: t('nav.theme.system'),
            }}
          />
          {clerkEnabled &&
            (viewer === 'authenticated' ? (
              <UserButton />
            ) : (
              <SignInButton mode="modal">
                <button type="button" className={buttonClass({ variant: 'primary', size: 'sm' })}>
                  {t('common.signIn')}
                </button>
              </SignInButton>
            ))}
        </div>
      </div>
    </header>
  )
}
