import { SignInButton, UserButton } from '@clerk/nextjs'
import { Button } from '@muni/ui/button'
import { Container } from '@muni/ui/layout'
import { ThemeToggle } from '@muni/ui/theme/theme-toggle'
import {
  BookOpen,
  BriefcaseBusiness,
  Building,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  Grid3x3,
  LayoutDashboard,
  Lightbulb,
  LogIn,
  Upload,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { clerkEnabled } from '@/server/clerk'
import type { Viewer } from '@muni/domain/enums'

import { LocaleSwitch } from './locale-switch'
import { NavLink } from './nav-link'

export async function AppHeader({ viewer }: { viewer: Viewer }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()])
  const links = [
    { href: '/', label: t('nav.dashboard'), Icon: LayoutDashboard },
    { href: '/employees', label: t('nav.employees'), Icon: Users },
    { href: '/departments', label: t('nav.departments'), Icon: Building },
    { href: '/positions', label: t('nav.positions'), Icon: BriefcaseBusiness },
    { href: '/courses', label: t('nav.courses'), Icon: BookOpen },
    { href: '/sessions', label: t('nav.sessions'), Icon: CalendarDays },
    { href: '/rooms', label: t('nav.rooms'), Icon: DoorOpen },
    { href: '/compliance', label: t('nav.compliance'), Icon: Grid3x3 },
    { href: '/advisor', label: t('nav.advisor'), Icon: Lightbulb },
    ...(viewer === 'authenticated'
      ? [{ href: '/import', label: t('nav.import'), Icon: Upload }]
      : []),
  ]

  return (
    <header className="sticky top-0 z-30 border-b border-border-default bg-surface-elevated/95 backdrop-blur">
      <Container className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-semibold text-fg">
          <GraduationCap aria-hidden className="size-5 text-accent-text" />
          {t('common.appName')}
        </Link>
        <nav
          aria-label={t('nav.primary')}
          className="order-last -mx-1 scrollbar-none flex w-full gap-1 overflow-x-auto md:order-none md:w-auto"
        >
          {links.map(({ href, label, Icon }) => (
            <NavLink key={href} href={href}>
              <Icon aria-hidden />
              {label}
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
                <Button variant="primary" size="sm">
                  <LogIn aria-hidden />
                  {t('common.signIn')}
                </Button>
              </SignInButton>
            ))}
        </div>
      </Container>
    </header>
  )
}
