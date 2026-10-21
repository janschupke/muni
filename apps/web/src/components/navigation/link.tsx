import NextLink from 'next/link'
import type { ComponentProps } from 'react'

/**
 * The app's link to its own pages. A link inside a page is not prefetched: a page of records
 * holds dozens of them, and every prefetch is a request to the server. A click still shows the
 * page's loading state as soon as the server starts answering, which it streams first. The
 * menu's links prefetch as the pointer reaches them (`IntentLink`), so a click there shows it
 * at once.
 */
export function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />
}
