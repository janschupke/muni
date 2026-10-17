import type { ReadInput, ReadName, ReadOutput } from '@/server/reads/registry'

/** A read the server refused or failed: its HTTP status and the reason it gave. */
export class ReadError extends Error {
  override name = 'ReadError'
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(`read failed: ${String(status)} ${code}`)
  }
}

/** A read's input as its query string; empty values (and anything not a value) are left out. */
export function readSearch(input: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'number' || typeof value === 'boolean') search.set(key, String(value))
    else if (typeof value === 'string' && value !== '') search.set(key, value)
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

/**
 * Runs a read on the server (`/api/read/<name>`). A signed-out answer reloads the page, which
 * the middleware then sends to sign-in (coming back here after); any other refusal is thrown
 * as a `ReadError`.
 */
export async function fetchRead<N extends ReadName>(
  name: N,
  input: ReadInput<N>,
  signal?: AbortSignal
): Promise<ReadOutput<N>> {
  const response = await fetch(`/api/read/${name}${readSearch(input)}`, {
    signal: signal ?? null,
    headers: { accept: 'application/json' },
  })
  if (response.ok) return (await response.json()) as ReadOutput<N>
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  const code = typeof body?.error === 'string' ? body.error : 'unknown'
  // Signed out meanwhile: the middleware answers before the read (no JSON reason).
  if (response.status === 401 || (response.status === 404 && code === 'unknown'))
    window.location.reload()
  throw new ReadError(response.status, code)
}
