/**
 * The in-app path a visitor took in this tab, for "back to …" links that name the page they
 * really came from (with its filters), not a fixed parent.
 */
export interface HistoryEntry {
  /** Path and query, e.g. `/employees?department=Laboratoře`. */
  href: string
  /** The page's document title, once known. */
  title: string | null
}

const MAX_ENTRIES = 30

/**
 * Forms are passed through, never returned to: after saving, "back" skips them.
 * @internal Exported for its tests.
 */
export function isTransient(href: string): boolean {
  return /\/(edit|new)$/.test(href.split('?')[0] ?? '')
}

/** A visit to `href`: the same page is ignored, the page before it means "went back". */
export function record(stack: HistoryEntry[], href: string): HistoryEntry[] {
  if (stack.at(-1)?.href === href) return stack
  if (stack.at(-2)?.href === href) return stack.slice(0, -1)
  return [...stack, { href, title: null }].slice(-MAX_ENTRIES)
}

export function withTitle(stack: HistoryEntry[], href: string, title: string): HistoryEntry[] {
  const top = stack.at(-1)
  if (top?.href !== href || top.title === title) return stack
  return [...stack.slice(0, -1), { href, title }]
}

/**
 * Where "back" goes from `current`: the latest earlier entry that is neither this page nor a
 * form. `direct` says it is the browser's previous entry too, so history.back() is exact.
 */
export function previousEntry(
  stack: HistoryEntry[],
  current: string
): { entry: HistoryEntry; direct: boolean } | null {
  const end = stack.at(-1)?.href === current ? stack.length - 1 : stack.length
  for (let i = end - 1; i >= 0; i--) {
    const entry = stack[i]
    if (!entry || entry.href === current || isTransient(entry.href)) continue
    return { entry, direct: i === end - 1 && end === stack.length - 1 }
  }
  return null
}

/** `"Alena Malá · Training register"` → `"Alena Malá"`. */
export function pageLabel(title: string): string {
  return title.split(' · ')[0] ?? title
}
