// @vitest-environment jsdom
import { getAdvisorInput, getDashboard } from '@muni/db/repositories'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getViewer } from '@/server/auth'
import { setLocale } from '@/server/actions/locale'
import { advisorInput, dashboard, session } from '@/test/fixtures'
import { NotFoundError, route } from '@/test/next'
import { Providers, renderClient, renderServer, resolveServer } from '@/test/render'

import ErrorPage from './error'
import RootLayout, { generateMetadata } from './layout'
import NotFound from './not-found'
import DashboardPage from './page'
import SignInPage from './sign-in/[[...sign-in]]/page'
import Template from './template'

const clerk = vi.hoisted(() => ({ enabled: false }))
vi.mock('@/server/clerk', () => ({
  get clerkEnabled() {
    return clerk.enabled
  },
}))
vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  UserButton: () => <button type="button">Account</button>,
  SignIn: () => <p>Clerk sign-in form</p>,
}))
vi.mock('@muni/db/repositories')
vi.mock('@/server/auth')
vi.mock('@/server/actions/locale', () => ({ setLocale: vi.fn(() => Promise.resolve()) }))

beforeEach(() => {
  clerk.enabled = false
  vi.mocked(getViewer).mockResolvedValue('anonymous')
  vi.mocked(getDashboard).mockResolvedValue(dashboard())
  vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput())
})

/** Renders the layout's <body> content (an <html> cannot be mounted inside a test container). */
async function renderLayout(children: ReactNode) {
  const tree = (await resolveServer(await RootLayout({ children }))) as {
    props: { children: ReactNode | ReactNode[] }
  }
  const html = clerk.enabled ? (tree.props.children as { props: { children: ReactNode[] } }) : tree
  const body = (html.props.children as ReactNode[])[1] as { props: { children: ReactNode } }
  // The layout's provider reads its locale from the request; the test providers stand in.
  const intl = body.props.children as { props: { children: ReactNode } }
  return render(<Providers>{intl.props.children}</Providers>)
}

describe('root layout', () => {
  it('titles every page after the app and wraps it in header, main and footer', async () => {
    expect(await generateMetadata()).toEqual({
      title: { default: 'Training register', template: '%s · Training register' },
      description: expect.any(String) as string,
    })
    route.pathname = '/employees'
    await renderLayout(<p>Obsah stránky</p>)
    expect(within(screen.getByRole('main')).getByText('Obsah stránky')).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: 'Employees' }).getAttribute('aria-current')).toBe(
      'page'
    )
    expect(within(nav).queryByRole('link', { name: 'Import' })).toBeNull()
    // Every destination carries its icon; the name stays the text.
    for (const link of within(nav).getAllByRole('link'))
      expect(link.querySelector('svg')).toBeTruthy()
    // Keyboard users can jump past the header straight to the page.
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main')
    expect(screen.getByRole('main').id).toBe('main')
    expect(screen.getByRole('contentinfo').textContent).toContain('Personal data is masked')
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
  })

  it('adds Clerk, sign-in and import once auth is configured', async () => {
    clerk.enabled = true
    const tree = (await RootLayout({ children: null })) as { props: Record<string, unknown> }
    expect(tree.props).toMatchObject({ signInUrl: '/sign-in', afterSignOutUrl: '/' })
    await renderLayout(<p>Obsah</p>)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()

    vi.mocked(getViewer).mockResolvedValue('authenticated')
    await renderLayout(<p>Obsah</p>)
    expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Import' }).length).toBeGreaterThan(0)
  })

  it('switches the language through the server action', async () => {
    const user = userEvent.setup()
    await renderLayout(<p>Obsah</p>)
    await user.click(screen.getByRole('radio', { name: 'Čeština' }))
    expect(setLocale).toHaveBeenCalledWith('cs')
  })
})

describe('dashboard', () => {
  it('links every count to the list behind it', async () => {
    await renderServer(DashboardPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^Expired/ }).getAttribute('href')).toBe(
      '/employees?status=ACTIVE&compliance=EXPIRED'
    )
    const rate = screen.getByRole('link', { name: /^Compliance/ })
    expect(rate.getAttribute('href')).toBe('/compliance')
    // 85 % held is in the yellow band.
    expect(rate.className).toContain('before:bg-warning-fill')
    expect(screen.getByRole('link', { name: 'Laboratoře' }).getAttribute('href')).toBe(
      '/employees?department=Laborato%C5%99e'
    )
    // The advisor alert: one overbooked session, two trainings with nothing booked.
    expect(screen.getByRole('status').textContent).toContain(
      '2 trainings are non-compliant now, 2 of them with nothing booked; 1 session is overbooked.'
    )
    expect(screen.getByRole('link', { name: 'Open the advisor' }).getAttribute('href')).toBe(
      '/advisor'
    )
  })

  it('stays quiet when nothing needs attention, and says when nothing is scheduled', async () => {
    vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput({ needs: [], sessions: [] }))
    vi.mocked(getDashboard).mockResolvedValue(dashboard({ upcomingSessions: [] }))
    await renderServer(DashboardPage())
    expect(screen.queryByRole('link', { name: 'Open the advisor' })).toBeNull()
    expect(screen.getByText('No sessions are scheduled.')).toBeTruthy()
  })

  it('shows the upcoming sessions, with edit links for signed-in users', async () => {
    vi.mocked(getViewer).mockResolvedValue('authenticated')
    vi.mocked(getDashboard).mockResolvedValue(dashboard({ upcomingSessions: [session()] }))
    await renderServer(DashboardPage())
    expect(screen.getByRole('link', { name: 'BOZP – základní školení' })).toBeTruthy()
  })
})

describe('error pages', () => {
  it('not found offers the way home', async () => {
    await renderServer(NotFound())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Not found')
    expect(screen.getByRole('link', { name: 'Go to overview' }).getAttribute('href')).toBe('/')
  })

  it('an error offers a retry', async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    renderClient(<ErrorPage error={new Error('db down')} reset={reset} />)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalled()
  })

  it('the route template fades each page in', () => {
    render(<Template>Stránka</Template>)
    expect(screen.getByText('Stránka').className).toBe('animate-fade-in')
  })
})

describe('sign-in', () => {
  it('is a 404 without auth, and the Clerk form with it', () => {
    expect(() => SignInPage()).toThrow(NotFoundError)
    clerk.enabled = true
    render(SignInPage())
    expect(screen.getByText('Clerk sign-in form')).toBeTruthy()
  })
})
