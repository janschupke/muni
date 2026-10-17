import { TooltipProvider } from '@muni/ui/tooltip'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

import { ToastsProvider } from '@/components/toasts'
import en from '@/i18n/messages/en.json'
import { STALE_MS } from '@/lib/query/query-client'

import { route } from './next'

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
  // The element as given, with its props resolved: what cloneElement is for.
  // eslint-disable-next-line @eslint-react/no-clone-element
  return changed ? cloneElement(element, props) : element
}

/**
 * A read cache of its own for one test, fresh as long as the app's (so a page's prefetched
 * reads are not asked again): nothing retried, nothing dropped while it runs.
 */
export const testQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: STALE_MS },
      mutations: { retry: false },
    },
  })

/** The providers the root layout puts around every page. */
export function Providers({
  children,
  client = testQueryClient(),
}: {
  children: ReactNode
  client?: QueryClient | undefined
}) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Europe/Prague">
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <ToastsProvider>{children}</ToastsProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>
  )
}

/** Every read the page made has answered (reads go to the server's handler, `reads.ts`). */
async function settled(client: QueryClient) {
  await waitFor(() => {
    const queries = client.getQueryCache().getAll()
    if (client.isFetching() > 0 || queries.some(q => q.state.status === 'pending'))
      throw new Error('reads still running')
  })
}

/**
 * Awaits a server component (a page's promise), renders it inside the app's providers, and
 * waits for the data its views read.
 */
export async function renderServer(page: ReactNode | Promise<ReactNode>) {
  const tree = await resolveServer(await page)
  const client = testQueryClient()
  const result = render(<Providers client={client}>{tree}</Providers>)
  await settled(client)
  return { ...result, client }
}

/** Renders a client component inside the app's providers. */
export function renderClient(ui: ReactNode, client: QueryClient = testQueryClient()) {
  return { ...render(<Providers client={client}>{ui}</Providers>), client }
}

/** A page's `params` / `searchParams` prop. */
export const params = <T,>(value: T) => Promise.resolve(value)

/**
 * A page's `searchParams` with the browser at the same address: the page's prefetch and its
 * view (which reads the address) ask for the same list.
 */
export function at(pathname: string, query: Record<string, string> = {}) {
  route.pathname = pathname
  route.search = new URLSearchParams(query).toString()
  return params(query)
}
