'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'

import { makeQueryClient } from '@/lib/query/query-client'

/**
 * The read cache, one per signed-in user and role (`scope`). Another user or role gets an
 * empty cache: nothing one account read is ever shown to another.
 */
export function QueryProvider({ scope, children }: { scope: string; children: ReactNode }) {
  return <ScopedCache key={scope}>{children}</ScopedCache>
}

function ScopedCache({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient)
  useEffect(
    () => () => {
      client.clear()
    },
    [client]
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
