'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useEffectEvent } from 'react'

import { type ToastMessage, useToast } from '@/components/toasts'
import { isLocalHref } from '@/lib/local-href'

import { changedBy, type WriteKind } from './invalidation'

/**
 * What every successful write does next. Reads the write changed (`kind`, see WRITES) and
 * not on screen drop their cached data, so the next visit (often the record just saved)
 * loads afresh instead of showing what it was. When the write goes on to `href`, those on
 * screen are only marked stale; otherwise they refetch in the background.
 */
export function useAfterWrite(kind: WriteKind): (href?: string) => void {
  const client = useQueryClient()
  const router = useRouter()
  return useCallback(
    (href?: string) => {
      const changed = changedBy(kind)
      client.removeQueries({ type: 'inactive', predicate: q => changed(q.queryKey) })
      void client.invalidateQueries({
        predicate: q => changed(q.queryKey),
        refetchType: href ? 'none' : 'active',
      })
      // Only ever within the app, whatever a server answered.
      if (href && isLocalHref(href)) router.push(href)
    },
    [client, router, kind]
  )
}

/**
 * For each write that finished (`written`), after its outcome has rendered (never inside the
 * server action's own transition, which Next is still settling): says so in a toast, then
 * runs `useAfterWrite`.
 */
export function useWhenWritten(
  kind: WriteKind,
  outcome: object,
  written: boolean,
  href: string | undefined,
  message: ToastMessage
): void {
  const afterWrite = useAfterWrite(kind)
  const toast = useToast()
  const announce = useEffectEvent(() => {
    toast(message)
  })
  useEffect(() => {
    if (!written) return
    announce()
    afterWrite(href)
  }, [outcome, written, href, afterWrite])
}
