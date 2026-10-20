'use client'

import { useState } from 'react'

import { SIDEBAR_COOKIE } from '@/lib/sidebar'

/**
 * Whether the sidebar is collapsed, kept in a cookie the server reads, so the first paint of
 * the next page is right.
 */
export function usePersistedCollapse(initial: boolean): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(initial)
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`
  }
  return [collapsed, toggle]
}
