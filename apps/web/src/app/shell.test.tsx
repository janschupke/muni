// @vitest-environment jsdom
import { getAdvisorInput, getDashboard } from '@muni/db/repositories'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { isValidElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getViewer } from '@/server/auth'
import { setLocale } from '@/server/actions/locale'
import { advisorInput, dashboard, session } from '@/test/fixtures'
import { setViewportWidth } from '@/test/media'
import { navigate, NotFoundError, requestCookies, route, router } from '@/test/next'
import { Providers, renderClient, renderServer, resolveServer } from '@/test/render'

import { AppFailure } from '@/components/app-failure'
import { NotFoundMessage } from '@/components/not-found-message'

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

type Element = { type: unknown; props: { children?: ReactNode } }

/** The first element of a type in a server tree, depth first through children. */
function find(node: ReactNode, type: string): Element | undefined {
  if (Array.isArray(node)) {
    for (const child of node as ReactNode[]) {
      const found = find(child, type)
      if (found) return found
    }
    return undefined
  }
  if (!isValidElement(node)) return undefined
  const element = node as Element
  return element.type === type ? element : find(element.props.children, type)
}

/** Renders the layout's <body> content (an <html> cannot be mounted inside a test container). */
async function renderLayout(children: ReactNode) {
  const body = find(await resolveServer(await RootLayout({ children })), 'body')
  // The layout's intl provider reads its locale from the request; the test providers stand in.
  const intl = body?.props.children as Element
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
    // The top bar: the logo and name lead home; language and theme sit at its end.
    const header = screen.getByRole('banner')
    expect(
      within(header).getByRole('link', { name: 'Training register' }).getAttribute('href')
    ).toBe('/')
    expect(within(header).getByRole('radiogroup', { name: 'Language' })).toBeTruthy()
    expect(within(header).getByRole('radiogroup', { name: 'Colour theme' })).toBeTruthy()
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

  it('groups the navigation, and collapses the sidebar to icons, remembering it', async () => {
    const user = userEvent.setup()
    await renderLayout(<p>Obsah</p>)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByText('Register')).toBeTruthy()
    expect(within(nav).getByRole('link', { name: 'Rooms' }).getAttribute('href')).toBe('/rooms')
    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    await user.click(collapse)
    expect(document.cookie).toContain('muni.sidebar=collapsed')
    // Icons only: the label stays the link's name; the group headings give way to rules.
    const rail = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(rail).getByRole('link', { name: 'Rooms' }).textContent).toBe('')
    expect(within(rail).queryByText('Register')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' }).getAttribute('aria-expanded')
    ).toBe('false')
    // Language and theme stay in the top bar, whatever the sidebar does.
    expect(
      within(screen.getByRole('banner')).getByRole('radiogroup', { name: 'Colour theme' })
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(document.cookie).toContain('muni.sidebar=expanded')
  })

  it('starts collapsed when the cookie says so', async () => {
    requestCookies.set('muni.sidebar', 'collapsed')
    await renderLayout(<p>Obsah</p>)
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy()
  })

  it('opens the navigation in a drawer on small screens, closing it on the way', async () => {
    const user = userEvent.setup()
    await renderLayout(<p>Obsah</p>)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const drawer = await screen.findByRole('dialog', { name: 'Menu' })
    // Only the navigation: the controls stay in the top bar, rendered once.
    expect(within(drawer).queryByRole('radiogroup')).toBeNull()
    expect(screen.getAllByRole('radiogroup', { name: 'Colour theme', hidden: true })).toHaveLength(
      1
    )
    // jsdom cannot follow the link; the drawer's own handler is what matters here.
    document.addEventListener(
      'click',
      event => {
        event.preventDefault()
      },
      { capture: true, once: true }
    )
    await user.click(within(drawer).getByRole('link', { name: 'Courses' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('closes the drawer when the route changes, and when the screen grows to the sidebar', async () => {
    const user = userEvent.setup()
    await renderLayout(<p>Obsah</p>)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await screen.findByRole('dialog')
    // The back button: a new path, no click in the drawer.
    act(() => {
      navigate('/rooms')
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await screen.findByRole('dialog')
    act(() => {
      setViewportWidth(800)
    })
    expect(screen.getByRole('dialog')).toBeTruthy()
    act(() => {
      setViewportWidth(1024)
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
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
  it('not found names the address and offers the way home and to every list', async () => {
    route.pathname = '/kurzy'
    await renderServer(NotFound())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page not found')
    expect(screen.getByText(/Nothing lives at \/kurzy\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to overview' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: 'Rooms' }).getAttribute('href')).toBe('/rooms')
  })

  it('a missing record says which, and leads back to its list', () => {
    route.pathname = '/employees/E9999/edit'
    renderClient(<NotFoundMessage entity="employees" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Employee not found')
    expect(screen.getByText('There is no employee E9999 in the register.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'All employees' }).getAttribute('href')).toBe(
      '/employees'
    )
  })

  it('an error is logged, shows its reference, and retries with fresh data', async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = Object.assign(new Error('db down'), { digest: '2731823015' })
    renderClient(<ErrorPage error={error} reset={reset} />)
    expect(log).toHaveBeenCalledWith(error)
    expect(screen.getByText('Reference: 2731823015')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to overview' }).getAttribute('href')).toBe('/')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(router.refresh).toHaveBeenCalled()
    expect(reset).toHaveBeenCalled()
  })

  it('a failure of the whole app draws its own page, in the chosen language', async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    document.cookie = 'NEXT_LOCALE=cs; path=/'
    const { unmount } = render(
      <AppFailure error={Object.assign(new Error('x'), { digest: 'abc' })} reset={reset} />
    )
    expect(screen.getByText('Něco se pokazilo')).toBeTruthy()
    expect(screen.getByText('Kód chyby: abc')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Zkusit znovu' }))
    expect(reset).toHaveBeenCalled()
    unmount()
    document.cookie = 'NEXT_LOCALE=; max-age=0; path=/'
    render(<AppFailure error={new Error('x')} reset={reset} />)
    expect(screen.getByText('Something went wrong')).toBeTruthy()
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
