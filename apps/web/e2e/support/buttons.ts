import { expect, type Page } from '@playwright/test'

// The button rule, read off the rendered page by the variant each Button carries
// (data-variant): in a group, at most one filled button (primary, or danger confirming a
// destructive act), and it comes last, on the right; ghost is only for backing out
// (CancelButton, data-cancel). Icon buttons (no text) are not part of a group's wording.
const COLLECT_GROUPS = `(({ root }) => {
  const scope = root ? document.querySelector(root) : document
  if (!scope) return { groups: [], ghosts: [] }
  const shown = el =>
    el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
    (el.textContent || '').trim() !== ''
  const name = el => '"' + (el.textContent || '').trim().slice(0, 30) + '" (' + el.dataset.variant + ')'
  const buttons = [...scope.querySelectorAll('[data-variant]')].filter(shown)
  const parents = new Set(buttons.map(b => b.parentElement))
  const groups = [...parents].flatMap(parent => {
    const members = [...parent.children].filter(el => el.hasAttribute('data-variant') && shown(el))
    return members.length < 2 ? [] : [members.map(el => ({ name: name(el), variant: el.dataset.variant }))]
  })
  const ghosts = buttons
    .filter(el => el.dataset.variant === 'ghost' && !el.hasAttribute('data-cancel'))
    .map(name)
  return { groups, ghosts }
})`

export async function expectButtonGroups(page: Page, label: string, root?: string) {
  const { groups, ghosts }: { groups: { name: string; variant: string }[][]; ghosts: string[] } =
    await page.evaluate(`${COLLECT_GROUPS}(${JSON.stringify({ root })})`)
  const problems = groups.flatMap(group => {
    const filled = group.filter(b => b.variant === 'primary' || b.variant === 'danger')
    const names = group.map(b => b.name).join(', ')
    if (filled.length > 1) return [`[${names}]: more than one filled button`]
    if (filled.length === 1 && filled[0] !== group.at(-1))
      return [`[${names}]: the filled button is not last`]
    return []
  })
  expect(
    [...problems, ...ghosts.map(g => `${g}: ghost, but not a way back out`)],
    `${label}: button groups`
  ).toEqual([])
}
