import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom lacks the pointer-capture and scrolling APIs Radix Select calls while opening.
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
})

afterEach(cleanup)
