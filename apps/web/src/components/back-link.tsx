'use client'

import { TextLink } from '@muni/ui/text-link'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useSyncExternalStore } from 'react'

import { pageLabel, previousEntry } from '@/lib/navigation-stack'

import { parseHistory, readHistory, subscribeHistory } from './navigation-history'

interface Fallback {
  href: string
  label: string
}

/**
 * "← Where you came from": the previous in-app page with its filters, named by its title.
 * Opened directly (nothing to go back to), it links to the parent page instead.
 */
export function BackLink({ fallback }: { fallback: Fallback }) {
  return (
    <Suspense fallback={<Arrow href={fallback.href} label={fallback.label} />}>
      <DynamicBackLink fallback={fallback} />
    </Suspense>
  )
}

function DynamicBackLink({ fallback }: { fallback: Fallback }) {
  const t = useTranslations('back')
  const router = useRouter()
  const pathname = usePathname()
  const query = useSearchParams().toString()
  // The server knows nothing of this tab's history: it renders the fallback, and so does the
  // first client render (null snapshot); the real target appears right after hydration.
  const raw = useSyncExternalStore(subscribeHistory, readHistory, () => null)
  const previous = previousEntry(parseHistory(raw), query ? `${pathname}?${query}` : pathname)
  if (!previous) return <Arrow href={fallback.href} label={fallback.label} />

  const { entry, direct } = previous
  const label = entry.title
    ? entry.href === '/'
      ? t('overview')
      : pageLabel(entry.title)
    : fallback.label
  return (
    <Arrow
      href={entry.href}
      label={label}
      onClick={
        direct
          ? event => {
              // The browser's own back keeps scroll position and does not grow the history.
              event.preventDefault()
              router.back()
            }
          : undefined
      }
    />
  )
}

function Arrow({
  href,
  label,
  onClick,
}: {
  href: string
  label: string
  onClick?: ((event: React.MouseEvent<HTMLAnchorElement>) => void) | undefined
}) {
  const t = useTranslations('back')
  return (
    <TextLink asChild className="inline-flex items-center gap-1">
      <Link href={href} {...(onClick && { onClick })} aria-label={t('to', { page: label })}>
        <ArrowLeft aria-hidden className="size-3.5" />
        {label}
      </Link>
    </TextLink>
  )
}
