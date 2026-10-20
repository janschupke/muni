import type { CourseOffering } from '@muni/domain/planner'

import { ACTIVE } from '../archive/archive'
import { toAmount } from '../core/context'

/**
 * A course's offerings as every read takes them: active providers only, by name. (A provider
 * archived keeps its offerings for when it comes back; nobody can schedule with it meanwhile.)
 */
export const offeringsInclude = {
  where: { provider: ACTIVE },
  select: {
    pricePerPerson: true,
    provider: { select: { id: true, name: true, isDefault: true } },
  },
  orderBy: { provider: { name: 'asc' } },
} as const

export const toOffering = (o: {
  pricePerPerson: { toString(): string }
  provider: { id: string; name: string; isDefault: boolean }
}): CourseOffering => ({
  providerId: o.provider.id,
  providerName: o.provider.name,
  price: toAmount(o.pricePerPerson),
  isDefault: o.provider.isDefault,
})
