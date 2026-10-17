import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { type BrowserContext, chromium, expect, type Page, test } from '@playwright/test'
import lighthouse, { type Flags } from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

import { APP_PAGES, loaded, pathOf } from './support/pages'
import { baseUrlOf } from './support/server'
import { storageState } from './support/users'

// Minimum category scores (0–1). Accessibility must be perfect; performance is measured on
// the desktop preset against a local production build.
const MINIMUM = { performance: 0.9, accessibility: 1, 'best-practices': 0.95, seo: 0.9 }
const SIGNED_IN_PORT = 9334
const SIGNED_OUT_PORT = 9335
const REPORTS = path.join(import.meta.dirname, '../test-results/lighthouse')

let profile: string
let context: BrowserContext
/** A tab kept open on the app: Clerk's script in it keeps the admin's session token fresh. */
let keepAlive: Page
const summary: Record<string, Record<string, number | string[]>> = {}

/**
 * Clerk's development instance serves its API and UI from *.clerk.accounts.dev, where
 * Cloudflare sets bot-management cookies: third-party from the app's origin. A production
 * instance runs on the app's own domain and sets none, so a finding that names only that
 * domain is the development setup's, not the app's.
 */
const CLERK_DEV = /^https:\/\/[^/]+\.clerk\.accounts\.dev\//

/** Every URL an audit's details name, sub-items included. */
function urlsIn(details: unknown): string[] {
  const items = (details as { items?: unknown[] } | undefined)?.items ?? []
  return items.flatMap(item => {
    const { url, subItems } = item as { url?: unknown; subItems?: unknown }
    return [...(typeof url === 'string' ? [url] : []), ...urlsIn(subItems)]
  })
}

const clerkDevOnly = (details: unknown) => {
  const urls = urlsIn(details)
  return urls.length > 0 && urls.every(url => CLERK_DEV.test(url))
}

test.beforeAll(async ({ baseURL }) => {
  await mkdir(REPORTS, { recursive: true })
  // Lighthouse opens its tabs in the browser's default context: a persistent context is that
  // context, so the admin's cookies (from the e2e setup project) reach every audited page.
  profile = await mkdtemp(path.join(tmpdir(), 'muni-lighthouse-'))
  context = await chromium.launchPersistentContext(profile, {
    args: [`--remote-debugging-port=${String(SIGNED_IN_PORT)}`],
  })
  await setupClerkTestingToken({ context })
  const state = JSON.parse(await readFile(storageState('admin'), 'utf8')) as {
    cookies: Parameters<BrowserContext['addCookies']>[0]
  }
  await context.addCookies([
    ...state.cookies,
    { name: 'NEXT_LOCALE', value: 'en', url: baseUrlOf(baseURL) },
  ])
  keepAlive = await context.newPage()
  await keepAlive.goto(baseUrlOf(baseURL))
})

test.afterAll(async () => {
  await context.close()
  await rm(profile, { recursive: true, force: true })
  await writeFile(path.join(REPORTS, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
})

/** One Lighthouse run; a run that fails or reports a runtime error throws. */
async function audit(url: string, port: number) {
  const flags: Flags = {
    port,
    output: 'html',
    logLevel: 'error',
    locale: 'en',
    // Resetting storage would delete the session cookies and sign the browser out.
    disableStorageReset: true,
  }
  const result = await lighthouse(url, flags, desktopConfig)
  if (!result) throw new Error(`Lighthouse returned nothing for ${url}`)
  if (result.lhr.runtimeError) throw new Error(result.lhr.runtimeError.message)
  return result
}

/**
 * Records the scores and fails on any category under its minimum, naming what cost it. A
 * category lowered only by findings about Clerk's development domain passes, and the summary
 * lists those findings under `clerkDevOnly`.
 */
async function expectScores(name: string, route: string, url: string, port: number) {
  const result = await audit(url, port)
  await writeFile(path.join(REPORTS, `${name}.html`), String(result.report))
  const excused: string[] = []
  const below = Object.entries(MINIMUM).flatMap(([id, min]) => {
    const category = result.lhr.categories[id]
    const score = category?.score ?? 0
    if (score >= min) return []
    const lost = (category?.auditRefs ?? [])
      .filter(ref => ref.weight > 0 && (result.lhr.audits[ref.id]?.score ?? 1) < 1)
      .map(ref => ref.id)
    const own = lost.filter(audit => !clerkDevOnly(result.lhr.audits[audit]?.details))
    if (own.length === 0) {
      excused.push(...lost)
      return []
    }
    return [`${id} ${String(score)} < ${String(min)}: ${own.join(', ')}`]
  })
  summary[route] = {
    ...Object.fromEntries(
      Object.keys(MINIMUM).map(id => [
        id,
        Math.round((result.lhr.categories[id]?.score ?? 0) * 100),
      ])
    ),
    ...(excused.length > 0 && { clerkDevOnly: excused }),
  }
  expect(below, route).toEqual([])
}

test('introduction page, signed out', async ({ baseURL }) => {
  const browser = await chromium.launch({
    args: [`--remote-debugging-port=${String(SIGNED_OUT_PORT)}`],
  })
  try {
    await expectScores('introduction', '/ (signed out)', `${baseUrlOf(baseURL)}/`, SIGNED_OUT_PORT)
  } finally {
    await browser.close()
  }
})

for (const entry of APP_PAGES.filter(p => p.status === undefined)) {
  const { name } = entry

  test(`${name} page`, async ({ baseURL }) => {
    const route = await pathOf(entry, async url => {
      await keepAlive.goto(`${baseUrlOf(baseURL)}${url}`)
      await loaded(keepAlive)
      return keepAlive.content()
    })
    await expectScores(name, route, `${baseUrlOf(baseURL)}${route}`, SIGNED_IN_PORT)
  })
}
