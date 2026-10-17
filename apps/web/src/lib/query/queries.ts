import { queryOptions } from '@tanstack/react-query'

import type { ReadInput, ReadName } from '@/server/reads/registry'

import { fetchRead } from './fetch-read'

/** The cache entry of a read: its name and input are its key. */
export const readQuery = <N extends ReadName>(name: N, input: ReadInput<N>) =>
  queryOptions({
    queryKey: ['read', name, input] as const,
    queryFn: ({ signal }) => fetchRead(name, input, signal),
  })

/** How long a form's read outlives its form: long enough to mount, never to be reused. */
export const FORM_GC_MS = 1_000

/**
 * A form's read: the page prefetches it fresh on every visit (see `prefetched`), and it is
 * dropped as soon as the form closes, so an edit always starts from what is saved (an
 * uncontrolled field never takes new defaults); never refetched while the user is typing.
 */
export const FORM_READ = {
  staleTime: 10_000,
  gcTime: FORM_GC_MS,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const
