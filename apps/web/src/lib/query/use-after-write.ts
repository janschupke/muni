'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useEffectEvent } from 'react'

import { type ToastMessage, useToast } from '@/components/toasts'

/**
 * What every successful write does next. Pages not on screen drop their cached data, so the
 * next visit (often the record just saved) loads afresh instead of showing what it was. When
 * the write goes on to `href`, the page being left is only marked stale; otherwise it
 * refetches in the background. A write can touch much (a booking changes the session, the
 * person and the dashboard), so everything is refreshed.
 */
export function useAfterWrite(): (href?: string) => void {
  const client = useQueryClient()
  const router = useRouter()
  return useCallback(
    (href?: string) => {
      client.removeQueries({ type: 'inactive' })
      void client.invalidateQueries({ refetchType: href ? 'none' : 'active' })
      if (href) router.push(href)
    },
    [client, router]
  )
}

/**
 * For each write that finished (`written`), after its outcome has rendered (never inside the
 * server action's own transition, which Next is still settling): says so in a toast, then
 * runs `useAfterWrite`.
 */
export function useWhenWritten(
  outcome: object,
  written: boolean,
  href: string | undefined,
  message: ToastMessage
): void {
  const afterWrite = useAfterWrite()
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
