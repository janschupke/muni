/**
 * Every issue code the importer can raise. Errors skip the row; warnings import it
 * with the automatic fix described, except the SKIPPING_CODES, which leave it out.
 * The web app translates each as `import.issues.<CODE>`.
 */
export const ISSUE_CODES = [
  // whole-row
  'SUMMARY_ROW',
  'TOO_MANY_CELLS',
  'DUPLICATE_ID',
  'DUPLICATE_PERSON',
  'RESERVED_ID',
  // generic field problems (errors)
  'REQUIRED',
  'INVALID_VALUE',
  'INVALID_DATE',
  'PLACEHOLDER_DATE',
  'INVALID_PRICE',
  'NEGATIVE_PRICE',
  'INVALID_NUMBER',
  'INVALID_TIME',
  'INVALID_CODE',
  'INVALID_STATUS',
  'INVALID_REQUIREMENT',
  'INVALID_VALIDITY',
  'VALIDITY_BEFORE_COMPLETION',
  'COURSE_NOT_FOUND',
  'EMPLOYEE_NOT_FOUND',
  'LEFT_WITHOUT_DATE',
  // automatic fixes (warnings)
  'EXCEL_SERIAL_DATE',
  'FREE_PRICE',
  'FORMULA_STRIPPED',
  'NAME_NORMALIZED',
  'EMAIL_NORMALIZED',
  'INVALID_EMAIL',
  'CODE_NORMALIZED',
  'VALUE_NORMALIZED',
  'VALIDITY_NORMALIZED',
  'VALIDITY_NONE',
  'VALIDITY_DERIVED',
  'VALIDITY_MISMATCH',
  'MANAGER_NOT_FOUND',
  'EMPLOYEE_REMAPPED',
  'NAME_MISMATCH',
  'NATIONAL_ID_INVALID',
  'STATUS_DATE_MISMATCH',
  'UNKNOWN_DEPARTMENT',
  'UNKNOWN_POSITION',
  'DUPLICATE_SLOT',
  'ROOM_DERIVED',
  'OVERBOOKED',
  'ZERO_CAPACITY',
  'FUTURE_COMPLETION',
  'MANAGER_CYCLE',
  'ROOM_TOO_SMALL',
  'ROOM_UNSUITABLE',
  'ROOM_BUSY',
  'PROVIDER_UNKNOWN',
  'PROVIDER_NOT_OFFERING',
  'NO_DEFAULT_PROVIDER',
  'OFFERING_ADDED',
  'WILL_CREATE',
  // left out (warnings that skip the row)
  'ARCHIVED',
] as const

export type IssueCode = (typeof ISSUE_CODES)[number]

/**
 * Warnings that leave the row out: it is, or refers to, a record that has been archived.
 * An import never revives an archived record, nor creates an active twin of it.
 */
export const SKIPPING_CODES: readonly IssueCode[] = ['ARCHIVED']
