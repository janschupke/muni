import 'server-only'

import { getDb } from '@muni/db/client'
import { loadReferenceSnapshot } from '@muni/db/reference'
import {
  getAdvisorInput,
  getComplianceMatrix,
  getDashboard,
  getPlannerInput,
  listRoomOptions,
  loadCompliance,
  pageOf,
} from '@muni/db/repositories'
import { packPlan, planAssignments, tableItems } from '@muni/domain/advisor'
import { groupOffers, planSessions } from '@muni/domain/planner'
import { todayIn } from '@muni/utils/dates'
import * as z from 'zod'

import { ADVISOR_PAGE_SIZE, ADVISOR_SORT, ADVISOR_VIEWS, OFFER_SORT } from '@/lib/list-keys'
import { listQuery } from '@/lib/search-params'

import { listInput, none, read } from './define'
import { advisorKeys, offerKeys } from './sorters'

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

/**
 * The advisor's plan, with the trainings of one table only: the view's (`?view=`), of the
 * breakdown's row (`?bucket=`), a page at a time and sorted on the server. Everything the
 * counts, the chart and the overbooked sessions need comes whole.
 */
export const advisor = read({
  guard: 'reader',
  input: z.object({
    view: z.enum(ADVISOR_VIEWS).optional(),
    bucket: z.string().min(1).max(16).optional(),
    ...listInput(ADVISOR_SORT),
  }),
  load: async ({ view = 'breakdown', bucket: asked, ...list }) => {
    const input = await getAdvisorInput()
    const plan = planAssignments(input)
    const { bucket, items, counts } = tableItems(plan, view, asked)
    const page = pageOf(
      items,
      { ...listQuery(list, ADVISOR_SORT), pageSize: ADVISOR_PAGE_SIZE },
      advisorKeys
    )
    return {
      // Packed: the same sessions recur on many items.
      plan: packPlan({ ...plan, items: page.items }),
      asOf: input.asOf,
      bucket,
      page: { page: page.page, pageCount: page.pageCount, total: page.total },
      counts,
    }
  },
})

/** The sessions the planner offers, one group per course, most urgent first, and the rooms. */
export const planner = read({
  guard: 'reader',
  input: z.object(listInput(OFFER_SORT)),
  load: async input => {
    const [advisorInput, plannerInput] = await Promise.all([getAdvisorInput(), getPlannerInput()])
    const offers = planSessions({
      asOf: advisorInput.asOf,
      items: planAssignments(advisorInput).items,
      ...plannerInput,
    })
    const { page, sort } = listQuery(input, OFFER_SORT)
    // The courses a page at a time, most urgent first; each one's offers in the order asked.
    const groups = pageOf(groupOffers(offers), { page, pageSize: PLANNER_PAGE_SIZE }, {})
    const sorted = groups.items.map(group => ({
      ...group,
      offers: pageOf(group.offers, { sort, pageSize: group.offers.length }, offerKeys).items,
    }))
    // Every room, so a review can move an offer to another one (with its fit shown).
    return { groups: { ...groups, items: sorted }, rooms: await listRoomOptions() }
  },
})

/** Courses per page of the planner. */
const PLANNER_PAGE_SIZE = 10

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
