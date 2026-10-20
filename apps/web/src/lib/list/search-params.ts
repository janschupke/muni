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

/** A list's parameter: `sort`, or `completionsSort` for a page's list named `completions`. */
export type ListParam<P extends string, N extends 'sort' | 'dir' | 'page'> = P extends ''
  ? N
  : `${P}${Capitalize<N>}`

export function listParam<P extends string, N extends 'sort' | 'dir' | 'page'>(
  prefix: P,
  name: N
): ListParam<P, N> {
  return (prefix ? `${prefix}${name[0]?.toUpperCase() ?? ''}${name.slice(1)}` : name) as ListParam<
    P,
    N
  >
}

/**
 * How a list asks the server for its rows, by the names its parameters have in the address:
 * the column, the direction, the page.
 */
export type ListInput<K extends string, P extends string = ''> = Partial<
  Record<ListParam<P, 'sort'>, K | undefined>
> &
  Partial<Record<ListParam<P, 'dir'>, 'desc' | undefined>> &
  Partial<Record<ListParam<P, 'page'>, number | undefined>>

/**
 * A list's sort and page from the address, as its read takes them. The page and the view
 * both read it here, so the prefetched entry is the one the view asks for. Page 1 and no sort
 * are left out: the list without them.
 */
export function parseList<K extends string, P extends string = ''>(
  params: Record<string, string | string[] | undefined>,
  keys: readonly K[],
  prefix: P = '' as P
): ListInput<K, P> {
  const sort = oneOf(param(params, listParam(prefix, 'sort')), keys)
  const page = Number(param(params, listParam(prefix, 'page')) ?? 1)
  return {
    ...(sort && { [listParam(prefix, 'sort')]: sort }),
    ...(sort &&
      param(params, listParam(prefix, 'dir')) === 'desc' && {
        [listParam(prefix, 'dir')]: 'desc',
      }),
    ...(Number.isInteger(page) && page > 1 && { [listParam(prefix, 'page')]: page }),
  } as ListInput<K, P>
}

/**
 * A list's input (a read's, which may carry other fields) read back as its sort and page (the
 * repositories' `ListQuery`); a sort that is not one of `keys` is no sort.
 */
export function listQuery<K extends string>(
  input: Record<string, unknown>,
  keys: readonly K[],
  prefix = ''
): { page: number; sort?: { by: K; desc: boolean } | undefined } {
  const by = oneOf(input[listParam(prefix, 'sort')] as string | undefined, keys)
  const page = input[listParam(prefix, 'page')]
  return {
    page: typeof page === 'number' ? page : 1,
    sort: by && { by, desc: input[listParam(prefix, 'dir')] === 'desc' },
  }
}
