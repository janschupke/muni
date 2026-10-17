import { queryOptions } from '@tanstack/react-query'

import type { ReadInput, ReadName } from '@/server/reads/registry'

import { fetchRead } from './fetch-read'

/** The cache entry of a read: its name and input are its key. */
export const readQuery = <N extends ReadName>(name: N, input: ReadInput<N>) =>
  queryOptions({
    queryKey: ['read', name, input] as const,
    queryFn: ({ signal }) => fetchRead(name, input, signal),
  })

/**
 * A form's read: fetched fresh each time the form opens and dropped when it closes, so an
 * edit always starts from what is saved; never refetched while the user is typing.
 */
export const FORM_READ = {
  staleTime: 0,
  gcTime: 0,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const
