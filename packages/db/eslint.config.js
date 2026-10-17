import { node } from '../../eslint.preset.js'

const UNIQUE_KEYS = 'name|code|externalId|email|clerkId|companyId'
const JOIN_ROWS =
  'sessionAssignment|roomCapability|courseCapability|courseDepartmentRequirement|coursePositionRequirement|departmentPosition'

export default [
  ...node(import.meta.dirname),
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Nothing carrying history is deleted: it is archived (see repositories/archiving.ts).
          // Bookings and join rows are the exceptions.
          selector: `CallExpression[callee.property.name=/^delete(Many)?$/]:not([callee.object.property.name=/^(${JOIN_ROWS})$/])`,
          message:
            'Archive the record instead (archiveRecord); only bookings and join rows are deleted.',
        },
        {
          selector: 'TaggedTemplateExpression TemplateElement[value.raw=/DELETE\\s+FROM/i]',
          message: 'Archive the record instead of deleting it in SQL.',
        },
        {
          // Unique keys are unique among active rows only, so a lookup by one must say so.
          selector: `CallExpression[callee.property.name=/^(findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|count|update|updateMany|upsert)$/] > ObjectExpression > Property[key.name='where'] > ObjectExpression:has(> Property[key.name=/^(${UNIQUE_KEYS})$/]):not(:has(> SpreadElement[argument.name='ACTIVE'])):not(:has(> Property[key.name='archivedAt']))`,
          message:
            'A lookup by a unique key must carry ...ACTIVE (or say which archived state it wants).',
        },
      ],
    },
  },
]
