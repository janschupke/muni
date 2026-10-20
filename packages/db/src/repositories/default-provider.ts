import { compareCs } from '@muni/utils/text'
import { fold } from '@muni/utils/text'

import type { Tx } from '../client'
import { ACTIVE } from './archive'

/** The provider an organisation's own training goes by, when it has one on record. */
const INTERNAL_PROVIDER = 'Interní školitel'

/**
 * Which provider should hold imported sessions that name none, when none does yet: the
 * internal one if it is on record, else the one that delivered the most completions (ties by
 * name). The same rule the migration that introduced the default applied. Null with no
 * active provider.
 */
export async function chooseDefaultProvider(tx: Tx): Promise<string | null> {
  const providers = await tx.provider.findMany({
    where: ACTIVE,
    select: { id: true, name: true, _count: { select: { completions: true } } },
  })
  const internal = fold(INTERNAL_PROVIDER)
  return (
    providers.toSorted(
      (a, b) =>
        Number(fold(b.name) === internal) - Number(fold(a.name) === internal) ||
        b._count.completions - a._count.completions ||
        compareCs(a.name, b.name)
    )[0]?.id ?? null
  )
}
