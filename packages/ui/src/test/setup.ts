import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom lacks APIs Radix calls: pointer capture and scrolling (Select), ResizeObserver (Slider).
globalThis.ResizeObserver = class {
  observe() {
    return undefined
  }
  unobserve() {
    return undefined
  }
  disconnect() {
    return undefined
  }
}

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
})

afterEach(cleanup)
