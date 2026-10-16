import { canWrite } from '@muni/domain/enums'
import { Container } from '@muni/ui/layout'
import { TextLink } from '@muni/ui/text-link'
import { todayIn } from '@muni/utils/dates'
import { formatDate } from '@muni/utils/format'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import type { SessionUser } from '@/server/auth'

import { LogoMark } from './logo-mark'

export async function AppFooter({ user }: { user: SessionUser | null }) {
  const [t, tn, locale] = await Promise.all([
    getTranslations('footer'),
    getTranslations('nav'),
    getLocale(),
  ])
  const links = user
    ? [
        { href: '/compliance', label: tn('compliance') },
        { href: '/advisor', label: tn('advisor') },
        ...(canWrite(user.role) ? [{ href: '/import', label: tn('import') }] : []),
      ]
    : []
  return (
    <footer className="mt-12 border-t border-border-default bg-surface-elevated">
      <Container className="flex flex-col gap-4 py-6 text-sm text-fg-muted sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 font-medium text-fg">
            <LogoMark className="size-5" />
            {t('appName')}
          </span>
          <span>{t('asOf', { date: formatDate(todayIn(), locale) })}</span>
          <span>{t(`access.${user?.role ?? 'VISITOR'}`)}</span>
        </div>
        {links.length > 0 && (
          <nav aria-label={t('nav')}>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {links.map(link => (
                <li key={link.href}>
                  <TextLink asChild tone="muted">
                    <Link href={link.href}>{link.label}</Link>
                  </TextLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </Container>
    </footer>
  )
}
