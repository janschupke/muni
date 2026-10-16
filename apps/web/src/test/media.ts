/**
 * jsdom has no `matchMedia`. This stand-in answers `(min-width: <n>rem)` queries for a viewport
 * width a test can change; the queries' change listeners hear about it. Reset after every test.
 */
const DEFAULT_WIDTH = 390

let width = DEFAULT_WIDTH
const lists = new Set<{ query: string; was: boolean; listeners: Set<() => void> }>()

function matches(query: string): boolean {
  const min = /^\(min-width:\s*([\d.]+)rem\)$/.exec(query)
  if (!min) throw new Error(`The matchMedia stand-in does not read "${query}".`)
  return width >= Number(min[1]) * 16
}

export function installMatchMedia() {
  window.matchMedia = (query: string) => {
    const list = { query, was: matches(query), listeners: new Set<() => void>() }
    lists.add(list)
    return {
      media: query,
      get matches() {
        return matches(query)
      },
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => list.listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => list.listeners.delete(listener),
    } as unknown as MediaQueryList
  }
}

/** Resizes the viewport; queries whose answer changes notify their listeners. */
export function setViewportWidth(next: number) {
  width = next
  for (const list of lists) {
    const now = matches(list.query)
    if (now === list.was) continue
    list.was = now
    for (const listener of list.listeners) listener()
  }
}

export function resetMedia() {
  width = DEFAULT_WIDTH
  lists.clear()
}
