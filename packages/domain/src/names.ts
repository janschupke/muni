/** A person's name as stored: first and last. */
export interface Named {
  firstName: string
  lastName: string
}

/** "Novák Jan": how lists, tables, options and references name a person (by surname). */
export const sortName = (person: Named): string => `${person.lastName} ${person.firstName}`

/** "Jan Novák": how a person's own page and its headings name them. */
export const displayName = (person: Named): string => `${person.firstName} ${person.lastName}`
