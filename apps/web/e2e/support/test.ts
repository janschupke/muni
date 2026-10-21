import { existsSync, readFileSync } from 'node:fs'

import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, type Page, test as base } from '@playwright/test'

import { readerUrl } from './server'

export { expect }

/** What the specs read of Clerk in the page. */
interface ClerkWindow {
  Clerk?: {
    loaded?: boolean
    session?: { getToken(options?: { skipCache?: boolean }): Promise<string | null> } | null
  }
}

/**
 * Playwright's `test`, with Clerk's testing token on every page (Clerk's bot protection
 * would otherwise refuse the browser's requests to its Frontend API), every visit waiting
 * until the app runs in the browser, and no Content-Security-Policy violation and no error
 * thrown in the page allowed (a hydration mismatch, React #418, re-renders the whole page).
 */
/** What a project or a spec can set for the app (`use: { … }`). */
export interface AppOptions {
  /** The app's language, set as its cookie before the page opens; null leaves it to the browser. */
  appLocale: 'en' | 'cs' | null
}

/**
 * A role's sign-in as this worker last left it: the saved one with a session token Clerk has
 * since renewed. The stored sign-in's token expires within a minute of the setup, and a page
 * asked for with an expired one waits while the server renews it through Clerk (seconds, on
 * every test's first visit); one a test before has just renewed costs nothing.
 */
const workerState = (stored: string, worker: number) =>
  stored.replace(/\.json$/, `.worker-${String(worker)}.json`)

/**
 * How long the saved session token has left (its `exp`; the least of its cookies'): it is
 * what the server judges, whatever the file's age. A token Clerk hands out lives a minute.
 */
function tokenLeftMs(file: string) {
  if (!existsSync(file)) return -Infinity
  const { cookies } = JSON.parse(readFileSync(file, 'utf8')) as {
    cookies: { name: string; value: string }[]
  }
  const expiries = cookies
    .filter(cookie => cookie.name.startsWith('__session'))
    .map(cookie => {
      const payload = cookie.value.split('.')[1] ?? ''
      const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp: number }
      return exp * 1000
    })
  return expiries.length > 0 ? Math.min(...expiries) - Date.now() : -Infinity
}

/**
 * Left long enough for Clerk to start in the page, which then renews the token before it
 * expires: still signed in as it was. A token with less, or none, is a trap for a test: the
 * server passes a page load within its clock-skew allowance (5 s past expiry) or renews the
 * token for it (a GET), but only Clerk in the browser writes the new one to the cookie, and
 * a navigation or a save in the app before that carries the old one, which Clerk sends to
 * sign-in. A person is never that quick; a test is. Such a test's first visit waits for Clerk
 * to write a new token; once written, Clerk keeps it fresh.
 */
const USABLE_MS = 20_000
/** Saved again, with a new token, once this little is left: until then it serves as it is. */
const RESAVE_MS = 45_000

/**
 * Clerk's scripts (versioned, so they never change under a URL), fetched once per worker: a
 * browser context starts with an empty cache, and each test would otherwise download them
 * again from Clerk's servers before Clerk can start.
 */
const clerkScripts = new Map<
  string,
  { status: number; headers: Record<string, string>; body: Buffer }
>()

async function serveClerkScripts(page: Page) {
  await page.context().route(/\.clerk\.accounts\.dev\/npm\//, async route => {
    const url = route.request().url()
    let script = clerkScripts.get(url)
    if (!script) {
      const response = await route.fetch()
      script = {
        status: response.status(),
        headers: response.headers(),
        body: await response.body(),
      }
      if (response.ok()) clerkScripts.set(url, script)
    }
    await route.fulfill(script)
  })
}

export const test = base.extend<AppOptions>({
  appLocale: ['en', { option: true }],
  // The reading projects spread over the readers' servers; a writer keeps its own.
  baseURL: async ({ baseURL }, provide, testInfo) => {
    await provide(baseURL === readerUrl(0) ? readerUrl(testInfo.parallelIndex) : baseURL)
  },
  storageState: async ({ storageState }, provide, testInfo) => {
    if (typeof storageState !== 'string') {
      await provide(storageState)
      return
    }
    const mine = workerState(storageState, testInfo.parallelIndex)
    await provide(tokenLeftMs(mine) >= USABLE_MS ? mine : storageState)
  },
  page: async ({ page, appLocale, baseURL, storageState }, provide, testInfo) => {
    await setupClerkTestingToken({ page })
    await serveClerkScripts(page)
    // A sign-in carried over from an earlier test brings its language with it: set or cleared.
    if (appLocale && baseURL)
      await page.context().addCookies([{ name: 'NEXT_LOCALE', value: appLocale, url: baseURL }])
    else await page.context().clearCookies({ name: 'NEXT_LOCALE' })
    // Anything the Content-Security-Policy blocked fails the test that loaded it, and so does
    // a word the browser has no message for (next-intl logs it and shows the key instead).
    const blocked: string[] = []
    const untranslated: string[] = []
    const thrown: string[] = []
    page.on('pageerror', error => {
      thrown.push(error.message)
    })
    page.on('console', message => {
      if (message.type() !== 'error') return
      if (/Content Security Policy/i.test(message.text())) blocked.push(message.text())
      if (/MISSING_MESSAGE|INSUFFICIENT_PATH|INVALID_MESSAGE|FORMATTING_ERROR/.test(message.text()))
        untranslated.push(message.text().split('\n')[0] ?? '')
    })
    // Pages arrive with their data from the server; a click before the app starts would
    // reload instead of navigating in the app. Every visit waits for the app to start (its
    // hydration marker), not for every resource to load: the page is usable before Clerk's
    // script and the fonts have all arrived.
    const goto = page.goto.bind(page)
    // Signed out (a state given inline) there is no token to wait for.
    let tokenFresh = typeof storageState !== 'string' || tokenLeftMs(storageState) >= USABLE_MS
    page.goto = async (url, options) => {
      const response = await goto(url, { waitUntil: 'domcontentloaded', ...options })
      await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
      // And React has put every streamed part of it in place: a part that arrives late waits
      // hidden at the end of the body for React's batched reveal, a few frames, and until then
      // a text or CSS query finds it twice. The document is parsed by now, so every part is in
      // React's reveal queue (`$RB`, its streaming runtime's) or needs none (a not-found page
      // renders in the browser): the queue empties when all are in place.
      await page.waitForFunction(
        () => ((window as unknown as { $RB?: unknown[] }).$RB?.length ?? 0) === 0
      )
      if (!tokenFresh) {
        await clerkLoaded(page)
        await page.evaluate(async () => {
          await (window as unknown as ClerkWindow).Clerk?.session?.getToken({ skipCache: true })
        })
        tokenFresh = true
      }
      return response
    }
    await provide(page)
    // The sign-in as this test leaves it, for the worker's next test: Clerk in the page
    // writes a new token to both its session cookies first (the server's renewal of a page
    // load writes only one, and reads the other; a cached token may be most of a minute old).
    const stored =
      typeof storageState === 'string' ? storageState.replace(/\.worker-\d+\.json$/, '.json') : null
    const mine = stored && workerState(stored, testInfo.parallelIndex)
    if (
      mine &&
      tokenLeftMs(mine) < RESAVE_MS &&
      !page.isClosed() &&
      page.url().startsWith('http')
    ) {
      await clerkLoaded(page)
      await page.evaluate(async () => {
        await (window as unknown as ClerkWindow).Clerk?.session?.getToken({ skipCache: true })
      })
      await page.context().storageState({ path: mine })
    }
    // Requests still in flight as the test ends (Clerk's polling) go unanswered, not as errors.
    await page.context().unrouteAll({ behavior: 'ignoreErrors' })
    expect(blocked, 'Content-Security-Policy violations').toEqual([])
    expect(untranslated, 'words the browser had no message for').toEqual([])
    expect(thrown, 'errors thrown in the page').toEqual([])
  },
})

/**
 * Clerk's script has arrived and started: what its sign-in and sign-up forms, and a fresh
 * session token, wait for. Pages are usable before it (they wait for hydration only).
 */
export async function clerkLoaded(page: Page) {
  await page.waitForFunction(() => (window as unknown as ClerkWindow).Clerk?.loaded === true)
}
