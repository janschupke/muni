'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { type ReactNode, Suspense, useEffect, useSyncExternalStore } from 'react'

import { type HistoryEntry, previousEntry, record, withTitle } from '@/lib/navigation-stack'

import { FocusKeeper } from './focus-keeper'

const KEY = 'muni.history'
const EVENT = 'muni:history'

export function readHistory(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function parseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : []
  } catch {
    return []
  }
}

function write(stack: HistoryEntry[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack))
  } catch {
    // Storage blocked: back links fall back to the parent page.
  }
  window.dispatchEvent(new Event(EVENT))
}

/** The page shown now, path and query, written as the recorder writes it. */
function currentHref(): string {
  const query = new URLSearchParams(window.location.search).toString()
  return query ? `${window.location.pathname}?${query}` : window.location.pathname
}

// The page this document loaded on (typed, bookmarked, reloaded, opened in a new tab). Read
// once, when the app's code first runs; in-app navigation never loads the document again.
const landed = typeof window === 'undefined' ? null : currentHref()

/**
 * Where a form or an archived record's page goes back to: the in-app page it was opened from,
 * with its filters. Null when the page was opened directly (nothing in this app led here),
 * or before the browser has read the history.
 */
export function originOf(raw: string | null = readHistory()): string | null {
  if (typeof window === 'undefined') return null
  const current = currentHref()
  if (current === landed) return null
  return previousEntry(parseHistory(raw), current)?.entry.href ?? null
}

/** `originOf`, kept current as the history is recorded; null on the server. */
export function useOrigin(): string | null {
  const raw = useSyncExternalStore(subscribeHistory, readHistory, () => null)
  return raw === null ? null : originOf(raw)
}

export function subscribeHistory(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
  }
}

/** Records each in-app page (path and query) and its final title for this tab. */
function Recorder() {
  const pathname = usePathname()
  const query = useSearchParams().toString()
  const href = query ? `${pathname}?${query}` : pathname

  useEffect(() => {
    write(record(parseHistory(readHistory()), href))
    // Titles arrive with the page's metadata, possibly after this effect: watch for them.
    // On a client navigation the next page's title can land while this observer is still
    // attached; only a title seen while the URL is still this page's belongs to it.
    const saveTitle = () => {
      // Normalised like `href` (URLSearchParams writes spaces as `+`, the location may not).
      const query = new URLSearchParams(window.location.search).toString()
      if ((query ? `${window.location.pathname}?${query}` : window.location.pathname) !== href)
        return
      write(withTitle(parseHistory(readHistory()), href, document.title))
    }
    saveTitle()
    const observer = new MutationObserver(saveTitle)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
    }
  }, [href])

  return null
}

export function NavigationHistory({ children }: { children: ReactNode }) {
  // The page runs in the browser from here on: links navigate in the app (and are recorded).
  // Browser tests wait for this mark before they follow a link.
  useEffect(() => {
    document.documentElement.dataset['hydrated'] = ''
  }, [])
  return (
    <>
      {/* useSearchParams needs a boundary; the recorder renders nothing, so null is exact. */}
      <Suspense fallback={null}>
        <Recorder />
      </Suspense>
      <FocusKeeper />
      {children}
    </>
  )
}
