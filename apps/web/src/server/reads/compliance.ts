import 'server-only'

import { getComplianceMatrix } from '@muni/db/repositories'

import { none, read } from './core/define'

/** Every course against every department and person. */
export const compliance = read({
  guard: 'reader',
  input: none,
  load: () => getComplianceMatrix(),
})
