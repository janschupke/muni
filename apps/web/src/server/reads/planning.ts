import 'server-only'

import { getDb } from '@muni/db/client'
import { loadReferenceSnapshot } from '@muni/db/reference'
import {
  getAdvisorInput,
  getComplianceMatrix,
  getDashboard,
  getPlannerInput,
} from '@muni/db/repositories'
import { planAssignments } from '@muni/domain/advisor'
import { planSessions } from '@muni/domain/planner'
import { todayIn } from '@muni/utils/dates'
import * as z from 'zod'

import type { PlannerGroup } from '@/features/planner/planner-view'

import { read } from './define'

// The overview and the planning pages. Their plans follow one fixed rule from the current
// data, the same for every visitor, so they are worked out here and sent ready.

const none = z.object({})

/** The overview: the figures, and what the advisor has waiting. */
export const dashboard = read({
  guard: 'reader',
  input: none,
  load: async () => {
    const [data, advisorInput] = await Promise.all([getDashboard(), getAdvisorInput()])
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

/** The advisor's plan: who needs which session, and when. */
export const advisor = read({
  guard: 'reader',
  input: none,
  load: async () => {
    const input = await getAdvisorInput()
    return { plan: planAssignments(input), asOf: input.asOf }
  },
})

/** The sessions the planner offers, one group per course, most urgent first. */
export const planner = read({
  guard: 'reader',
  input: none,
  load: async () => {
    const [advisorInput, plannerInput] = await Promise.all([getAdvisorInput(), getPlannerInput()])
    const offers = planSessions({
      asOf: advisorInput.asOf,
      items: planAssignments(advisorInput).items,
      ...plannerInput,
    })
    return [...Map.groupBy(offers, o => o.course.code).values()].map(
      (courseOffers): PlannerGroup => ({
        course: (courseOffers[0] as (typeof offers)[number]).course,
        offers: courseOffers,
      })
    )
  },
})

/** Every course against every department and person. */
export const compliance = read({
  guard: 'reader',
  input: none,
  load: () => getComplianceMatrix(),
})

/** What an import is checked against: the records there are now, and today. */
export const importReference = read({
  guard: 'admin',
  input: none,
  load: async () => ({ reference: await loadReferenceSnapshot(getDb()), today: todayIn() }),
})
