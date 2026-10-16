import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { chromium, expect, test, type Browser } from '@playwright/test'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

import { PUBLIC_PAGES } from './support/pages'

// Minimum category scores (0–1). Accessibility must be perfect; performance is measured on
// the desktop preset against a local production build.
const MINIMUM = { performance: 0.9, accessibility: 1, 'best-practices': 0.95, seo: 0.9 }
const DEBUG_PORT = 9334
const REPORTS = path.join(import.meta.dirname, '../test-results/lighthouse')

let browser: Browser
const summary: Record<string, Record<string, number>> = {}

test.beforeAll(async () => {
  // Lighthouse drives Playwright's own Chromium over the DevTools protocol.
  browser = await chromium.launch({ args: [`--remote-debugging-port=${String(DEBUG_PORT)}`] })
  await mkdir(REPORTS, { recursive: true })
})

test.afterAll(async () => {
  await browser.close()
  await writeFile(path.join(REPORTS, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
})

for (const { name, path: route } of PUBLIC_PAGES.filter(p => !('status' in p))) {
  test(`${name} page`, async ({ baseURL }) => {
    const result = await lighthouse(
      `${String(baseURL)}${route}`,
      { port: DEBUG_PORT, output: 'html', logLevel: 'error', locale: 'en' },
      desktopConfig
    )
    if (!result) throw new Error(`Lighthouse returned nothing for ${route}`)
    if (result.lhr.runtimeError) throw new Error(result.lhr.runtimeError.message)
    await writeFile(path.join(REPORTS, `${name}.html`), String(result.report))
    summary[route] = Object.fromEntries(
      Object.keys(MINIMUM).map(id => [
        id,
        Math.round((result.lhr.categories[id]?.score ?? 0) * 100),
      ])
    )

    // Each category under its minimum, with the audits that cost it points.
    const below = Object.entries(MINIMUM).flatMap(([id, min]) => {
      const category = result.lhr.categories[id]
      const score = category?.score ?? 0
      if (score >= min) return []
      const lost = (category?.auditRefs ?? [])
        .filter(ref => ref.weight > 0 && (result.lhr.audits[ref.id]?.score ?? 1) < 1)
        .map(ref => ref.id)
      return [`${id} ${String(score)} < ${String(min)}: ${lost.join(', ')}`]
    })
    expect(below, route).toEqual([])
  })
}
