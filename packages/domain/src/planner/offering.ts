import { compareCs } from '@muni/utils/text'

/** A provider that offers a course, at its price per person. */
export interface CourseOffering {
  providerId: string
  providerName: string
  price: number
  /** The provider imported sessions without one fall to. */
  isDefault: boolean
}

/**
 * Who a new session of the course goes to unless chosen otherwise: the default provider if it
 * offers the course, else the cheapest offering (ties by name); null when nobody offers it.
 */
export function proposedOffering(offerings: readonly CourseOffering[]): CourseOffering | null {
  return (
    offerings.find(o => o.isDefault) ??
    offerings.toSorted(
      (a, b) => a.price - b.price || compareCs(a.providerName, b.providerName)
    )[0] ??
    null
  )
}
