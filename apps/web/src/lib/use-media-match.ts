'use client'

import { useEffect, useRef } from 'react'

/** Runs `onMatch` each time the media query starts to match (a screen widened past a breakpoint). */
export function useOnMediaMatch(query: string, onMatch: () => void) {
  const latest = useRef(onMatch)
  useEffect(() => {
    latest.current = onMatch
  })
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => {
      if (media.matches) latest.current()
    }
    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [query])
}
