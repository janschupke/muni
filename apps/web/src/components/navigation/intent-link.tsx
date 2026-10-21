'use client'

import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'

/**
 * A menu link: its page's loading state is fetched as the pointer, the focus or a touch reaches
 * it, so the click that follows shows it at once. Not on sight: every menu link on every page
 * load would be a request to the server each. Handlers given (a tooltip's) still run.
 */
export function IntentLink({
  href,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: Omit<ComponentProps<typeof NextLink>, 'href' | 'prefetch'> & { href: string }) {
  const router = useRouter()
  const prefetch = () => {
    router.prefetch(href)
  }
  return (
    <NextLink
      href={href}
      prefetch={false}
      onMouseEnter={event => {
        prefetch()
        onMouseEnter?.(event)
      }}
      onFocus={event => {
        prefetch()
        onFocus?.(event)
      }}
      onTouchStart={event => {
        prefetch()
        onTouchStart?.(event)
      }}
      {...props}
    />
  )
}
