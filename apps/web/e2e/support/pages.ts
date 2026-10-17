import { expect, type Page } from '@playwright/test'

type AppPage =
  | { name: string; path: string; status?: number }
  /** A page whose id the database picks: the first link under `prefix` on the `via` page. */
  | { name: string; via: string; prefix: string; status?: number }

/**
 * Every page of the register, with seeded examples for the dynamic ones (an admin reaches all
 * of them). The not-found page answers 404, which Lighthouse refuses to audit; axe still
 * checks it.
 */
export const APP_PAGES: readonly AppPage[] = [
  { name: 'overview', path: '/' },
  { name: 'employees', path: '/employees' },
  { name: 'employee', path: '/employees/E0153' },
  { name: 'departments', path: '/departments' },
  { name: 'department', via: '/departments', prefix: '/departments/' },
  { name: 'positions', path: '/positions' },
  { name: 'position', via: '/positions', prefix: '/positions/' },
  { name: 'courses', path: '/courses' },
  { name: 'course', path: '/courses/BOZP-Z' },
  { name: 'sessions', path: '/sessions' },
  { name: 'session', path: '/sessions/T016' },
  { name: 'rooms', path: '/rooms' },
  { name: 'room', via: '/rooms', prefix: '/rooms/' },
  { name: 'providers', path: '/providers' },
  { name: 'provider', via: '/providers', prefix: '/providers/' },
  { name: 'compliance', path: '/compliance' },
  { name: 'planner', path: '/planner' },
  { name: 'advisor', path: '/advisor' },
  { name: 'advisor-action', path: '/advisor?view=action' },
  { name: 'advisor-planned', path: '/advisor?view=planned' },
  { name: 'advisor-overbooked', path: '/advisor?view=overbooked' },
  { name: 'users', path: '/users' },
  { name: 'user', via: '/users', prefix: '/users/' },
  // Forms (admins): the heading row's actions, the date and time fields.
  { name: 'course-new', path: '/courses/new' },
  { name: 'course-edit', path: '/courses/BOZP-Z/edit' },
  { name: 'session-new', path: '/sessions/new' },
  { name: 'session-edit', path: '/sessions/T016/edit' },
  { name: 'employee-new', path: '/employees/new' },
  { name: 'employee-edit', path: '/employees/E0153/edit' },
  { name: 'completion-new', path: '/employees/E0153/completions/new' },
  { name: 'department-new', path: '/departments/new' },
  // Archived records (admins).
  { name: 'employees-archived', path: '/employees/archived' },
  { name: 'rooms-archived', path: '/rooms/archived' },
  { name: 'not-found', path: '/no-such-page', status: 404 },
]

/** The page's path; for one reached through another page, the first matching link there. */
export async function pathOf(
  page: AppPage,
  fetchHtml: (path: string) => Promise<string>
): Promise<string> {
  if ('path' in page) return page.path
  const html = await fetchHtml(page.via)
  const escaped = page.prefix.replace(/[/.]/g, '\\$&')
  // A record, not the list's own "new" and "archived" pages an admin sees first.
  const match = new RegExp(`href="(${escaped}(?!new"|archived")[^"/?]+)"`).exec(html)
  if (!match?.[1]) throw new Error(`No ${page.prefix} link on ${page.via}`)
  return match[1]
}

/**
 * The page's data is there: pages read it in the browser, showing skeletons in a loading
 * region (`aria-busy`) until it comes. Checks and audits wait for this, or they would judge
 * the skeletons.
 */
export async function loaded(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
}
