'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { type ReactNode, Suspense, useEffect } from 'react'

import { type HistoryEntry, record, withTitle } from '@/lib/navigation-stack'

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
      {children}
    </>
  )
}
