import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettled } from './use-settled'

const PAUSE = 400

// @vitest-environment jsdom

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSettled', () => {
  it('gives a value once it has stayed the same for the pause, and nothing before', () => {
    const { result } = renderHook(({ value }) => useSettled(value, PAUSE), {
      initialProps: { value: 'a' },
    })
    expect(result.current).toBeUndefined()
    act(() => {
      vi.advanceTimersByTime(PAUSE)
    })
    expect(result.current).toBe('a')
  })

  it('starts the pause again on every change: only the last value settles', () => {
    const { result, rerender } = renderHook(({ value }) => useSettled(value, PAUSE), {
      initialProps: { value: 'a' },
    })
    act(() => {
      vi.advanceTimersByTime(PAUSE - 1)
    })
    rerender({ value: 'b' })
    act(() => {
      vi.advanceTimersByTime(PAUSE - 1)
    })
    // 'a' never settled; 'b' has not yet.
    expect(result.current).toBeUndefined()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('b')
    // A new value keeps the settled one until it settles itself.
    rerender({ value: 'c' })
    expect(result.current).toBe('b')
  })
})
