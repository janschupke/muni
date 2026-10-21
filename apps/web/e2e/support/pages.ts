import { expect, type Page } from '@playwright/test'

import { firstRecordPath, type SeededRecord } from './db'

type AppPage =
  | { name: string; path: string; status?: number }
  /** A page of a seeded record the database picks (the first by name), then `suffix`. */
  | { name: string; record: SeededRecord; suffix?: string; status?: number }

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
  { name: 'department', record: 'department' },
  { name: 'department-bookings', record: 'department', suffix: '/bookings' },
  { name: 'positions', path: '/positions' },
  { name: 'position', record: 'position' },
  { name: 'position-bookings', record: 'position', suffix: '/bookings' },
  { name: 'courses', path: '/courses' },
  { name: 'course', path: '/courses/BOZP-Z' },
  { name: 'sessions', path: '/sessions' },
  { name: 'session', path: '/sessions/T016' },
  { name: 'rooms', path: '/rooms' },
  { name: 'room', record: 'room' },
  { name: 'providers', path: '/providers' },
  { name: 'provider', record: 'provider' },
  { name: 'compliance', path: '/compliance' },
  { name: 'planner', path: '/planner' },
  { name: 'advisor', path: '/advisor' },
  { name: 'advisor-action', path: '/advisor?view=action' },
  { name: 'advisor-planned', path: '/advisor?view=planned' },
  { name: 'advisor-overbooked', path: '/advisor?view=overbooked' },
  { name: 'advisor-upcoming', path: '/advisor?bucket=upcoming' },
  { name: 'advisor-page-2', path: '/advisor?page=2' },
  { name: 'users', path: '/users' },
  { name: 'user', record: 'user' },
  // Forms (admins): the heading row's actions, the date and time fields.
  { name: 'course-new', path: '/courses/new' },
  { name: 'course-edit', path: '/courses/BOZP-Z/edit' },
  { name: 'session-new', path: '/sessions/new' },
  { name: 'session-edit', path: '/sessions/T016/edit' },
  { name: 'employee-new', path: '/employees/new' },
  { name: 'employee-edit', path: '/employees/E0153/edit' },
  { name: 'completion-new', path: '/employees/E0153/completions/new' },
  { name: 'completion-edit', record: 'completion of E0153', suffix: '/edit' },
  { name: 'course-session-new', path: '/courses/BOZP-Z/sessions/new' },
  { name: 'department-new', path: '/departments/new' },
  { name: 'department-edit', record: 'department', suffix: '/edit' },
  { name: 'position-new', path: '/positions/new' },
  { name: 'position-edit', record: 'position', suffix: '/edit' },
  { name: 'room-new', path: '/rooms/new' },
  { name: 'room-edit', record: 'room', suffix: '/edit' },
  { name: 'provider-new', path: '/providers/new' },
  { name: 'provider-edit', record: 'provider', suffix: '/edit' },
  // Administration (admins).
  { name: 'import', path: '/import' },
  // Archived records (admins).
  { name: 'employees-archived', path: '/employees/archived' },
  { name: 'rooms-archived', path: '/rooms/archived' },
  { name: 'courses-archived', path: '/courses/archived' },
  { name: 'sessions-archived', path: '/sessions/archived' },
  { name: 'completions-archived', path: '/completions/archived' },
  { name: 'departments-archived', path: '/departments/archived' },
  { name: 'positions-archived', path: '/positions/archived' },
  { name: 'providers-archived', path: '/providers/archived' },
  { name: 'users-archived', path: '/users/archived' },
  // An archived record's own page: the seed archives nothing, so crud.spec.ts checks one
  // it archived itself.
  { name: 'not-found', path: '/no-such-page', status: 404 },
]

/** The page's path; a record's page is that of the first seeded one (read once). */
export async function pathOf(page: AppPage): Promise<string> {
  if ('path' in page) return page.path
  return (await firstRecordPath(page.record)) + (page.suffix ?? '')
}

/**
 * The page is there and runs in the browser: its data arrived (pages bring it from the
 * server; anything read in the browser shows skeletons in a loading region, `aria-busy`),
 * and the app has started (`data-hydrated` on the root), so a link is followed in the app.
 * Checks, audits and clicks wait for this, or they would judge skeletons or reload the page.
 */
export async function loaded(page: Page): Promise<void> {
  await expect(page.locator('html[data-hydrated]')).toHaveCount(1)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
}

/** A form's own submit button, on its heading row ("Create department", "Save changes"). */
export const save = (page: Page) => page.getByRole('main').locator('form button[type="submit"]')
