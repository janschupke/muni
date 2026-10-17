import { QueryClient } from '@tanstack/react-query'

import { ReadError } from './fetch-read'

/** How long read data counts as fresh: a revisit or refocus inside it asks nothing. */
export const STALE_MS = 5 * 60_000

/**
 * The app's query client. Data stays fresh for five minutes; after that a page shows what it
 * has and refetches in the background when it is opened again or the window regains focus.
 * Refusals (4xx) are answers, not failures: only server errors are retried, twice.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_MS,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failures, error) =>
          !(error instanceof ReadError && error.status < 500) && failures < 2,
      },
      mutations: { retry: false },
    },
  })
}
