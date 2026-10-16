type PublicPage =
  | { name: string; path: string; status?: number }
  /** A page whose id the database picks: the first link under `prefix` on the `via` page. */
  | { name: string; via: string; prefix: string; status?: number }

/**
 * Every page a signed-out visitor can reach, with seeded examples for the dynamic ones. The
 * not-found page answers 404, which Lighthouse refuses to audit; axe still checks it.
 */
export const PUBLIC_PAGES: readonly PublicPage[] = [
  { name: 'overview', path: '/' },
  { name: 'employees', path: '/employees' },
  { name: 'employee', path: '/employees/E0153' },
  { name: 'courses', path: '/courses' },
  { name: 'course', path: '/courses/BOZP-Z' },
  { name: 'sessions', path: '/sessions' },
  { name: 'session', path: '/sessions/T016' },
  { name: 'rooms', path: '/rooms' },
  { name: 'room', via: '/rooms', prefix: '/rooms/' },
  { name: 'compliance', path: '/compliance' },
  { name: 'advisor', path: '/advisor' },
  { name: 'advisor-action', path: '/advisor?view=action' },
  { name: 'advisor-planned', path: '/advisor?view=planned' },
  { name: 'advisor-overbooked', path: '/advisor?view=overbooked' },
  { name: 'not-found', path: '/no-such-page', status: 404 },
]

/** The page's path; for one reached through another page, the first matching link there. */
export async function pathOf(
  page: PublicPage,
  fetchHtml: (path: string) => Promise<string>
): Promise<string> {
  if ('path' in page) return page.path
  const html = await fetchHtml(page.via)
  const escaped = page.prefix.replace(/[/.]/g, '\\$&')
  const match = new RegExp(`href="(${escaped}[^"/?]+)"`).exec(html)
  if (!match?.[1]) throw new Error(`No ${page.prefix} link on ${page.via}`)
  return match[1]
}
