import 'server-only'

import { getAdvisorInput, getDashboard, loadCompliance } from '@muni/db/repositories'
import { planAssignments } from '@muni/domain/advisor'

import { none, read } from './core/define'

// The overview and the planning pages. Their plans follow one fixed rule from the current
// data, the same for every visitor, so they are worked out here and sent ready.
/** The overview: the figures, and what the advisor has waiting. */
export const dashboard = read({
  guard: 'reader',
  input: none,
  load: async () => {
    // One compliance load for both: the figures and the advisor's counts.
    const compliance = loadCompliance()
    const [data, advisorInput] = await Promise.all([
      getDashboard({ compliance }),
      getAdvisorInput({ compliance }),
    ])
    const plan = planAssignments(advisorInput)
    return {
      data,
      advisor: {
        now: plan.totals.now,
        action: plan.breakdown[0]?.counts.ACTION_REQUIRED ?? 0,
        overbooked: plan.overbooked.length,
      },
    }
  },
})
