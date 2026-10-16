/**
 * Every issue code the importer can raise. Errors skip the row; warnings import it
 * with the automatic fix described. The web app translates each as `import.issues.<CODE>`.
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
] as const

export type IssueCode = (typeof ISSUE_CODES)[number]
