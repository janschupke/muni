import { SignInButton, UserButton } from '@clerk/nextjs'
import type { Viewer } from '@muni/domain/enums'
import { Button } from '@muni/ui/button'
import { ThemeToggle } from '@muni/ui/theme/theme-toggle'
import {
  BookOpen,
  BriefcaseBusiness,
  Building,
  CalendarDays,
  CalendarRange,
  DoorOpen,
  Grid3x3,
  LayoutDashboard,
  Lightbulb,
  LogIn,
  Upload,
  Users,
} from 'lucide-react'
import { cookies } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { SIDEBAR_COOKIE } from '@/lib/sidebar'
import { clerkEnabled } from '@/server/clerk'

import { LocaleSwitch } from './locale-switch'
import { SidebarShell, type NavGroup } from './sidebar-shell'

/** The navigation, the language/theme/account controls and the frame around every page. */
export async function AppShell({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  const [t, locale, cookieStore] = await Promise.all([getTranslations(), getLocale(), cookies()])
  const item = (href: string, label: string, Icon: typeof Users) => ({
    href,
    label,
    icon: <Icon aria-hidden />,
  })
  const groups: NavGroup[] = [
    { label: null, items: [item('/', t('nav.dashboard'), LayoutDashboard)] },
    {
      label: t('nav.groups.register'),
      items: [
        item('/employees', t('nav.employees'), Users),
        item('/departments', t('nav.departments'), Building),
        item('/positions', t('nav.positions'), BriefcaseBusiness),
      ],
    },
    {
      label: t('nav.groups.training'),
      items: [
        item('/courses', t('nav.courses'), BookOpen),
        item('/sessions', t('nav.sessions'), CalendarDays),
        item('/rooms', t('nav.rooms'), DoorOpen),
      ],
    },
    {
      label: t('nav.groups.planning'),
      items: [
        item('/compliance', t('nav.compliance'), Grid3x3),
        item('/advisor', t('nav.advisor'), Lightbulb),
        item('/planner', t('nav.planner'), CalendarRange),
        ...(viewer === 'authenticated' ? [item('/import', t('nav.import'), Upload)] : []),
      ],
    },
  ]
  const controls = (
    <>
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
              <span className="max-sm:sr-only">{t('common.signIn')}</span>
            </Button>
          </SignInButton>
        ))}
    </>
  )
  return (
    <SidebarShell
      groups={groups}
      controls={controls}
      initiallyCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === 'collapsed'}
      labels={{
        appName: t('common.appName'),
        primary: t('nav.primary'),
        menu: t('nav.menu'),
        close: t('common.close'),
        collapse: t('nav.collapse'),
        expand: t('nav.expand'),
      }}
    >
      {children}
    </SidebarShell>
  )
}
