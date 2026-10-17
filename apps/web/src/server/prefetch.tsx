import 'server-only'

import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache, type ReactNode } from 'react'

import { FreshReads } from '@/components/fresh-reads'
import { FORM_GC_MS, readQuery } from '@/lib/query/queries'
import { getSessionUser, type SessionUser } from '@/server/auth'
import { RateLimitedError, spendRequest } from '@/server/rate-limit'

import type { ReadInput, ReadName, ReadOutput } from './reads/registry'
import { type ReadAnswer, runRead } from './reads/run'

/** One read a page needs, with the input its view asks for (the same cache key). */
export type PageRead = { [N in ReadName]: { name: N; input: ReadInput<N> } }[ReadName]

/**
 * A page's read, once per request: the page's prefetch and its title (generateMetadata) ask
 * for the same one, and the database is asked once. It counts toward the reader's limit;
 * past it, the browser reads (and is told to wait).
 */
const readOnce = cache(
  async (
    name: ReadName,
    input: string,
    user: SessionUser
  ): Promise<ReadAnswer<unknown> | { kind: 'limited' } | null> => {
    try {
      await spendRequest('read', user.id)
    } catch (error) {
      if (error instanceof RateLimitedError) return { kind: 'limited' }
      throw error
    }
    return runRead(name, JSON.parse(input) as Record<string, unknown>, user).catch(
      (error: unknown) => {
        console.error(error)
        return null
      }
    )
  }
)

/**
 * A record page's title: the record's name, from the same read the page shows (so the tab,
 * the route announcer and the reader's history name it from the start); `fallback` when it
 * is not there or cannot be read.
 */
export async function titleOf<N extends ReadName>(
  read: { name: N; input: ReadInput<N> },
  title: (data: ReadOutput<N>) => string | null | undefined,
  fallback: string
): Promise<Metadata> {
  const user = await getSessionUser()
  const answer = user ? await readOnce(read.name, JSON.stringify(read.input), user) : null
  const named = answer?.kind === 'ok' ? title(answer.data as ReadOutput<N>) : null
  return { title: named === '' ? fallback : (named ?? fallback) }
}

/**
 * Runs a page's reads on the server and hands the answers to the browser's read cache, so the
 * page paints with its data and the view's first query asks nothing. The page awaits it, so
 * a record that is not there is the page's 404 (the status too, before anything is sent).
 * Anything else (past the read limit, a failure) leaves the read to the browser, which shows
 * its own message and a way to try again.
 */
export async function prefetched(
  user: SessionUser,
  reads: readonly PageRead[],
  view: ReactNode,
  /** A form's read: dropped as soon as the form closes, as `FORM_READ` asks. */
  { form = false }: { form?: boolean } = {}
): Promise<ReactNode> {
  const client = new QueryClient()
  const answers = await Promise.all(
    reads.map(read => readOnce(read.name, JSON.stringify(read.input), user))
  )
  if (answers.some(answer => answer?.kind === 'not_found')) notFound()
  answers.forEach((answer, i) => {
    const read = reads[i]
    if (answer?.kind === 'ok' && read)
      client.setQueryData(readQuery(read.name, read.input as never).queryKey, answer.data as never)
  })
  const boundary = (
    <HydrationBoundary
      state={dehydrate(client)}
      // A hydrated query keeps the longer of its two lifetimes: a form's starts short.
      {...(form && { options: { defaultOptions: { queries: { gcTime: FORM_GC_MS } } } })}
    >
      {view}
    </HydrationBoundary>
  )
  // A form opens with what the server just read, never with an older cached copy.
  return form ? (
    <FreshReads queryKeys={reads.map(read => readQuery(read.name, read.input as never).queryKey)}>
      {boundary}
    </FreshReads>
  ) : (
    boundary
  )
}
