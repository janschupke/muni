// @vitest-environment jsdom
import { getAdvisorInput, getDashboard } from '@muni/db/repositories'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { isValidElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppFailure } from '@/components/shell/app-failure'
import { NotFoundMessage } from '@/components/shell/not-found-message'
import { setLocale } from '@/server/actions/locale'
import { isAccountArchived } from '@/server/auth'
import { signInAs, signOut } from '@/test/auth'
import { expectLogged } from '@/test/console'
import { advisorInput, dashboard, session } from '@/test/fixtures'
import { setViewportWidth } from '@/test/media'
import { navigate, requestCookies, route, router } from '@/test/next'
import { Providers, renderClient, renderServer, resolveServer } from '@/test/render'

import ErrorPage from './error'
import GlobalError from './global-error'
import RootLayout, { generateMetadata } from './layout'
import NotFound from './not-found'
import DashboardPage from './page'
import SignInPage from './sign-in/[[...sign-in]]/page'
import SignUpPage from './sign-up/[[...sign-up]]/page'
import Template from './template'

vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
  UserButton: () => <button type="button">Account</button>,
  SignIn: () => <p>Clerk sign-in form</p>,
  SignUp: () => <p>Clerk sign-up form</p>,
}))
vi.mock('@muni/db/repositories')
vi.mock('@/server/auth')
vi.mock('@/server/actions/locale', () => ({ setLocale: vi.fn(() => Promise.resolve()) }))

beforeEach(() => {
  signInAs('VIEWER')
  vi.mocked(getDashboard).mockResolvedValue(dashboard())
  vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput())
})

interface Element {
  type: unknown
  props: { children?: ReactNode }
}

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
    expect(screen.getByRole('contentinfo').textContent).toContain(
      'Personal data is redacted for your role'
    )
    // The top bar: the logo and name lead home; language and theme sit at its end.
    const header = screen.getByRole('banner')
    expect(
      within(header).getByRole('link', { name: 'Training register' }).getAttribute('href')
    ).toBe('/')
    expect(within(header).getByRole('radiogroup', { name: 'Language' })).toBeTruthy()
    expect(within(header).getByRole('radiogroup', { name: 'Colour theme' })).toBeTruthy()
    // The account menu, with the role beside it.
    expect(within(header).getByRole('button', { name: 'Account' })).toBeTruthy()
    expect(within(header).getByText('Viewer')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
  })

  it('wraps the app in Clerk, and gives visitors a top bar with sign-in and no navigation', async () => {
    signOut()
    const tree = (await RootLayout({ children: null })) as { props: Record<string, unknown> }
    expect(tree.props).toMatchObject({
      signInUrl: '/sign-in',
      signUpUrl: '/sign-up',
      afterSignOutUrl: '/',
    })
    await renderLayout(<p>Obsah</p>)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Account' })).toBeNull()
    expect(screen.getByRole('contentinfo').textContent).toContain('Sign in to see the register.')
  })

  it('gives admins the administration group: import and users', async () => {
    signInAs('ADMIN')
    await renderLayout(<p>Obsah</p>)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByText('Administration')).toBeTruthy()
    expect(within(nav).getByRole('link', { name: 'Import' }).getAttribute('href')).toBe('/import')
    expect(within(nav).getByRole('link', { name: 'Users' }).getAttribute('href')).toBe('/users')
    expect(within(screen.getByRole('banner')).getByText('Admin')).toBeTruthy()
    expect(screen.getByRole('contentinfo').textContent).toContain('You can edit')
  })

  it('keeps the full role read-only: no administration', async () => {
    signInAs('FULL')
    await renderLayout(<p>Obsah</p>)
    expect(screen.queryByRole('link', { name: 'Import' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
    expect(within(screen.getByRole('banner')).getByText('Full access')).toBeTruthy()
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

describe('home', () => {
  it('introduces the app to visitors, with sign-in and sign-up, and reads no data', async () => {
    signOut()
    await renderServer(DashboardPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Training register' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in')
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe(
      '/sign-up'
    )
    expect(screen.getByRole('heading', { name: 'What it does' })).toBeTruthy()
    expect(screen.getByText('Full access')).toBeTruthy()
    expect(getDashboard).not.toHaveBeenCalled()
    expect(getAdvisorInput).not.toHaveBeenCalled()
  })

  it('tells a signed-in user whom an admin archived that their access has ended', async () => {
    signOut()
    vi.mocked(isAccountArchived).mockResolvedValue(true)
    await renderServer(DashboardPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Your access has ended' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(getDashboard).not.toHaveBeenCalled()
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
      '/departments/dep_lab'
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
    vi.mocked(getDashboard).mockResolvedValue(dashboard({ upcomingSessions: [], byDepartment: [] }))
    await renderServer(DashboardPage())
    expect(screen.queryByRole('link', { name: 'Open the advisor' })).toBeNull()
    expect(screen.getByText('No sessions are scheduled.')).toBeTruthy()
    expect(screen.getByText('No active employees with mandatory courses yet.')).toBeTruthy()
  })

  it('shows the upcoming sessions, with edit links for admins', async () => {
    signInAs('ADMIN')
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

  it('a failure of the whole app still says so, in its own document', () => {
    expectLogged('error')
    const error = Object.assign(new Error('boom'), { digest: '2731823015' })
    let tag: unknown = null
    // Rendered where a document cannot be: what its <html><body> holds, the app's failure.
    function Inside() {
      const page = GlobalError({ error, reset: vi.fn() })
      tag = isValidElement(page) && page.type
      const body = (page as { props: { children: { props: { children: ReactNode } } } }).props
        .children
      return body.props.children
    }
    renderClient(<Inside />)
    expect(tag).toBe('html')
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    expect(screen.getByText(/2731823015/)).toBeTruthy()
  })

  it('every record route has its own not-found page, leading back to its list', () => {
    const pages = import.meta.glob<{ default: () => ReactNode }>('./*/*/not-found.tsx', {
      eager: true,
    })
    const lists = Object.keys(pages).map(path => path.split('/')[1])
    expect(lists.toSorted()).toEqual([
      'courses',
      'departments',
      'employees',
      'positions',
      'providers',
      'rooms',
      'sessions',
      'users',
    ])
    for (const [path, page] of Object.entries(pages)) {
      const list = path.split('/')[1] ?? ''
      route.pathname = `/${list}/X1`
      const { unmount } = renderClient(<page.default />)
      expect(screen.getByRole('heading', { level: 1 }).textContent, path).toMatch(/ not found$/)
      expect(screen.getByRole('link', { name: /^All / }).getAttribute('href'), path).toBe(
        `/${list}`
      )
      unmount()
    }
  })

  it('an error is logged, shows its reference, and retries with fresh data', async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    const log = expectLogged('error')
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
    expectLogged('error')
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
    // No cookie: the browser's languages decide, as they do for the app.
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB', 'cs'])
    const english = render(<AppFailure error={new Error('x')} reset={reset} />)
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    english.unmount()
    languages.mockReturnValue(['cs-CZ'])
    render(<AppFailure error={new Error('x')} reset={reset} />)
    expect(screen.getByText('Něco se pokazilo')).toBeTruthy()
  })

  it('the route template fades each page in', () => {
    render(<Template>Stránka</Template>)
    expect(screen.getByText('Stránka').className).toBe('animate-fade-in')
  })
})

describe('sign-in and sign-up', () => {
  it('are the Clerk forms', () => {
    render(SignInPage())
    expect(screen.getByText('Clerk sign-in form')).toBeTruthy()
    render(SignUpPage())
    expect(screen.getByText('Clerk sign-up form')).toBeTruthy()
  })
})
