import type { Db } from '../src/client'

/** The default provider's id (the seed makes "Interní školitel" the default). Tests only. */
export async function defaultProviderId(db: Db): Promise<string> {
  return (
    await db.provider.findFirstOrThrow({
      where: { isDefault: true, archivedAt: null },
      select: { id: true },
    })
  ).id
}

/** Makes sure the provider offers the course (at the given price). Tests only. */
export async function offer(db: Db, providerId: string, courseId: string, price = 0) {
  await db.providerCourse.upsert({
    where: { providerId_courseId: { providerId, courseId } },
    create: { providerId, courseId, pricePerPerson: price },
    update: { pricePerPerson: price },
  })
}
