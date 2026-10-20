import { addDays, type IsoDate } from '@muni/utils/dates'
import { compareCs } from '@muni/utils/text'

import { needsNewSession, NOW } from '../advisor'
import { PLAN_NOW_DAYS, type PlannedPerson, type PlannerCourse, type PlannerInput } from './types'

/** Trainings of one course due together, and by when. */
export interface DemandGroup {
  course: PlannerCourse
  bucket: string
  deadline: IsoDate
  /** Earliest lapse first, then by name. */
  people: PlannedPerson[]
}

/**
 * The trainings only a new session would place, grouped by course and by when they are due:
 * everything lapsed already together (due within `PLAN_NOW_DAYS`), then one group per month
 * they lapse in (due the day before the first of them lapses). Most urgent group first.
 */
export function demandGroups(input: PlannerInput): DemandGroup[] {
  const courses = new Map(input.courses.map(c => [c.code, c]))
  const groups = new Map<string, DemandGroup>()
  for (const item of input.items) {
    if (!needsNewSession(item)) continue
    const course = courses.get(item.need.course.code)
    if (!course) continue
    const due =
      item.bucket === NOW || item.lapses === null
        ? addDays(input.asOf, PLAN_NOW_DAYS)
        : addDays(item.lapses, -1)
    const key = `${course.code}|${item.bucket}`
    const group = groups.get(key) ?? { course, bucket: item.bucket, deadline: due, people: [] }
    if (due < group.deadline) group.deadline = due
    group.people.push({
      externalId: item.need.employee.externalId,
      name: item.need.employee.name,
      department: item.need.employee.department,
      lapses: item.lapses,
    })
    groups.set(key, group)
  }
  return [...groups.values()]
    .map(group => ({
      ...group,
      people: group.people.toSorted(
        (a, b) => (a.lapses ?? '').localeCompare(b.lapses ?? '') || compareCs(a.name, b.name)
      ),
    }))
    .sort(
      (a, b) => a.deadline.localeCompare(b.deadline) || a.course.code.localeCompare(b.course.code)
    )
}
