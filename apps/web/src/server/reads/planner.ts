import 'server-only'

import { getAdvisorInput, getPlannerInput, listRoomOptions, pageOf } from '@muni/db/repositories'
import { planAssignments } from '@muni/domain/advisor'
import { groupOffers, planSessions } from '@muni/domain/planner'
import * as z from 'zod'

import { OFFER_SORT } from '@/lib/list/list-keys'
import { listQuery } from '@/lib/list/search-params'

import { listInput, read } from './core/define'
import { offerKeys } from './core/sorters'

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
