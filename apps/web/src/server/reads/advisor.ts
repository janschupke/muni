import 'server-only'

import { getAdvisorInput, pageOf } from '@muni/db/repositories'
import { itemsToBook, pack, planAssignments, tableItems } from '@muni/domain/advisor'
import * as z from 'zod'

import { ADVISOR_PAGE_SIZE, ADVISOR_SORT, ADVISOR_VIEWS } from '@/lib/list/list-keys'
import { listQuery } from '@/lib/list/search-params'

import { listInput, read } from './core/define'
import { advisorKeys } from './core/sorters'

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
      plan: pack({ ...plan, items: page.items }),
      asOf: input.asOf,
      bucket,
      page: { page: page.page, pageCount: page.pageCount, total: page.total },
      counts,
    }
  },
})

/**
 * The trainings a "Book…" opens: a person's, a course's, a department's or a position's (or a
 * mix) that need booking, as the advisor's plan has them, with the sessions each can take.
 * Read when the dialog opens, from the plan as it is then.
 */
export const bookingChoices = read({
  guard: 'admin',
  input: z.object({
    employee: z.string().min(1).max(32).optional(),
    course: z.string().min(1).max(32).optional(),
    department: z.string().min(1).max(64).optional(),
    position: z.string().min(1).max(64).optional(),
  }),
  load: async query => {
    const input = await getAdvisorInput()
    return {
      asOf: input.asOf,
      items: pack(itemsToBook(planAssignments(input), query)),
    }
  },
})
