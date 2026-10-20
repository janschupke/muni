import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { setViewportWidth } from '@/test/media'

import { useOnMediaMatch } from './use-media-match'

// @vitest-environment jsdom

describe('useOnMediaMatch', () => {
  it('runs when the query starts to match, not when it stops', () => {
    const onMatch = vi.fn()
    const { unmount } = renderHook(() => {
      useOnMediaMatch('(min-width: 64rem)', onMatch)
    })
    setViewportWidth(1280)
    expect(onMatch).toHaveBeenCalledTimes(1)
    setViewportWidth(390)
    expect(onMatch).toHaveBeenCalledTimes(1)
    unmount()
    setViewportWidth(1280)
    expect(onMatch).toHaveBeenCalledTimes(1)
  })
})
