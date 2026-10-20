import { SignInButton, UserButton } from '@clerk/nextjs'
import { canWrite } from '@muni/domain/enums'
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
  Handshake,
  LayoutDashboard,
  Lightbulb,
  LogIn,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react'
import { cookies } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { RoleBadge } from '@/components/badges/status-badges'
import { SIDEBAR_COOKIE } from '@/lib/sidebar'
import type { SessionUser } from '@/server/auth'

import { LocaleSwitch } from './locale-switch'
import { type NavGroup, PublicShell, SidebarShell } from './sidebar-shell'

/**
 * The language/theme/account controls and the frame around every page: the navigation for
 * signed-in users, a bare top bar for visitors (who see only the landing page and sign-in).
 */
export async function AppShell({
  user,
  children,
}: {
  user: SessionUser | null
  children: ReactNode
}) {
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
        item('/providers', t('nav.providers'), Handshake),
      ],
    },
    {
      label: t('nav.groups.planning'),
      items: [
        item('/compliance', t('nav.compliance'), Grid3x3),
        item('/advisor', t('nav.advisor'), Lightbulb),
        item('/planner', t('nav.planner'), CalendarRange),
      ],
    },
    ...(user && canWrite(user.role)
      ? [
          {
            label: t('nav.groups.admin'),
            items: [
              item('/import', t('nav.import'), Upload),
              item('/users', t('nav.users'), ShieldCheck),
            ],
          },
        ]
      : []),
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
      {user ? (
        <>
          <RoleBadge value={user.role} className="max-sm:sr-only" />
          <UserButton />
        </>
      ) : (
        <SignInButton mode="modal">
          <Button variant="primary" size="sm">
            <LogIn aria-hidden />
            <span className="max-sm:sr-only">{t('common.signIn')}</span>
          </Button>
        </SignInButton>
      )}
    </>
  )
  if (!user) {
    return (
      <PublicShell appName={t('common.appName')} controls={controls}>
        {children}
      </PublicShell>
    )
  }
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
