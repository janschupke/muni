/**
 * Every page a signed-out visitor can reach, with seeded examples for the dynamic ones. The
 * not-found page answers 404, which Lighthouse refuses to audit; axe still checks it.
 */
export const PUBLIC_PAGES = [
  { name: 'overview', path: '/' },
  { name: 'employees', path: '/employees' },
  { name: 'employee', path: '/employees/E0153' },
  { name: 'courses', path: '/courses' },
  { name: 'course', path: '/courses/BOZP-Z' },
  { name: 'sessions', path: '/sessions' },
  { name: 'session', path: '/sessions/T016' },
  { name: 'compliance', path: '/compliance' },
  { name: 'advisor', path: '/advisor' },
  { name: 'advisor-action', path: '/advisor?view=action' },
  { name: 'advisor-planned', path: '/advisor?view=planned' },
  { name: 'advisor-overbooked', path: '/advisor?view=overbooked' },
  { name: 'not-found', path: '/no-such-page', status: 404 },
] as const
