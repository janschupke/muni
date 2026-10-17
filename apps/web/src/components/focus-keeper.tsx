'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

/** The page's main region, which can take focus (`tabIndex={-1}` in the root layout). */
const main = () => document.getElementById('main')

/** Focus that is nowhere: on the body, or on an element no longer in the page. */
const lost = () => {
  const active = document.activeElement
  return active === null || active === document.body || !active.isConnected
}

/**
 * Keeps keyboard focus somewhere useful:
 * - after a client navigation, on the new page's title (as a fresh page load starts at the
 *   top), unless the page put it somewhere already (a form's first field);
 * - when the focused element leaves the page (a row archived, a booking cancelled), on the
 *   main region, instead of the body, where the next Tab would start from the top.
 */
export function FocusKeeper() {
  const pathname = usePathname()
  const previous = useRef(pathname)

  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    const frame = requestAnimationFrame(() => {
      const region = main()
      if (!region) return
      // Something on the new page took focus (a form's first field): leave it there.
      const active = document.activeElement
      if (!lost() && active !== region && region.contains(active)) return
      const title = region.querySelector<HTMLElement>('h1')
      const target = title ?? region
      if (title && !title.hasAttribute('tabindex')) title.tabIndex = -1
      target.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [pathname])

  useEffect(() => {
    let focused: Element | null = null
    const remember = (event: FocusEvent) => {
      focused = event.target instanceof Element ? event.target : null
    }
    // Removing the focused element moves focus to the body without any event: watch for it.
    const observer = new MutationObserver(() => {
      if (focused && !focused.isConnected && lost()) {
        focused = null
        main()?.focus({ preventScroll: true })
      }
    })
    // `focus` does not bubble: listen in the capture phase.
    document.addEventListener('focus', remember, true)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      document.removeEventListener('focus', remember, true)
      observer.disconnect()
    }
  }, [])

  return null
}
