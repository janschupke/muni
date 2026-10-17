'use client'

import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'

/**
 * Drops what the cache holds for `queryKeys` before the page's prefetched answers hydrate:
 * hydrated over nothing, they are in the cache on the first render, so a form opens with
 * them. Hydrated over an older entry, the form would mount with that one first, and an
 * uncontrolled field never takes the newer default. Runs once, as the page first renders.
 */
export function FreshReads({
  queryKeys,
  children,
}: {
  queryKeys: readonly (readonly unknown[])[]
  children: ReactNode
}) {
  const client = useQueryClient()
  useState(() => {
    for (const queryKey of queryKeys) client.removeQueries({ queryKey, exact: true })
    return null
  })
  return children
}
