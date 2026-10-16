import { render as rtlRender, type RenderOptions } from '@testing-library/react'
import type { ReactNode } from 'react'

import { TooltipProvider } from '../components/tooltip'

/** RTL's render inside the provider the app's root layout supplies. */
export function render(ui: ReactNode, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, { wrapper: TooltipProvider, ...options })
}
