import axe from 'axe-core'
import { expect } from 'vitest'

// The same rule set as the browser sweep (e2e/a11y.spec.ts), for what it cannot reach without
// Clerk: signed-in views, forms and the import wizard. jsdom has no layout, so colour contrast
// and target size are left to the browser; a page rendered without the root layout has no
// landmarks, so the page-level rules are off too.
const OFF = ['color-contrast', 'target-size', 'region', 'landmark-one-main', 'page-has-heading-one']

export async function expectNoAxeViolations(container: Element = document.body) {
  const { violations } = await axe.run(container, {
    runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
    rules: Object.fromEntries(OFF.map(id => [id, { enabled: false }])),
  })
  expect(
    violations.map(v => ({ rule: v.id, targets: v.nodes.map(n => n.target.join(' ')) }))
  ).toEqual([])
}
