import { TooltipProvider } from '@muni/ui/tooltip'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

import en from '@/i18n/messages/en.json'

type Props = Record<string, unknown>

const isAsync = (type: unknown): type is (props: Props) => Promise<ReactNode> =>
  typeof type === 'function' && type.constructor.name === 'AsyncFunction'

/**
 * Renders async server components the way the server would: each one is awaited, depth
 * first, wherever it sits (children or any prop), until only client-renderable elements
 * remain. Client components are left for React to render.
 */
export async function resolveServer(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(child => resolveServer(child as ReactNode)))
  if (!isValidElement(node)) return node
  const element = node as ReactElement<Props>
  if (isAsync(element.type)) return resolveServer(await element.type(element.props))
  const props: Props = {}
  let changed = false
  for (const [key, value] of Object.entries(element.props)) {
    if (isValidElement(value) || Array.isArray(value)) {
      props[key] = await resolveServer(value as ReactNode)
      changed = true
    }
  }
  return changed ? cloneElement(element, props) : element
}

/** The providers the root layout puts around every page. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Europe/Prague">
      <TooltipProvider>{children}</TooltipProvider>
    </NextIntlClientProvider>
  )
}

/** Awaits a server component (a page's promise) and renders it inside the app's providers. */
export async function renderServer(page: ReactNode | Promise<ReactNode>) {
  const tree = await resolveServer(await page)
  return render(<Providers>{tree}</Providers>)
}

/** Renders a client component inside the app's providers. */
export function renderClient(ui: ReactNode) {
  return render(<Providers>{ui}</Providers>)
}

/** A page's `params` / `searchParams` prop. */
export const params = <T,>(value: T) => Promise.resolve(value)
