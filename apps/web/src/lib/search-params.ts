export type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** First value of a query parameter, or undefined. */
export function param(
  params: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const value = params[key]
  const first = Array.isArray(value) ? value[0] : value
  return first === undefined || first === '' ? undefined : first
}

export function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[]
): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined
}

/** Builds `path?…` from the current params with some keys replaced (undefined removes). */
export function withParams(
  path: string,
  current: Record<string, string | undefined>,
  changes: Record<string, string | number | undefined>
): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries({ ...current, ...changes })) {
    if (value !== undefined && value !== '') next.set(key, String(value))
  }
  const query = next.toString()
  return query ? `${path}?${query}` : path
}

/** `?sort=<key>&dir=desc` → `{ by, desc }`; anything else → undefined. */
export function parseSort<T extends string>(
  params: Record<string, string | string[] | undefined>,
  allowed: readonly T[]
): { by: T; desc: boolean } | undefined {
  const by = oneOf(param(params, 'sort'), allowed)
  return by === undefined ? undefined : { by, desc: param(params, 'dir') === 'desc' }
}
