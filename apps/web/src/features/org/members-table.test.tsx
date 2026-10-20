// @vitest-environment jsdom
import type { EmployeeListItem } from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EmployeesTable } from '@/features/employees/employees-table'
import { employeeRow } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import { MembersTable } from './members-table'

const [BOZP] = employeeRow().requirements
if (!BOZP) throw new Error('fixture')
const need = (courseCode: string, opening: 'OPEN' | 'FULL' | 'NONE') => ({
  ...BOZP,
  courseCode,
  courseName: `Course ${courseCode}`,
  booked: null,
  opening,
})
const reasonOf = (button: HTMLElement) =>
  document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent

const page = (items: EmployeeListItem[]) => ({
  items,
  total: items.length,
  page: 1,
  pageCount: 1,
  pageSize: 25,
})

describe('a group’s people, opened from its list row', () => {
  it('put every training’s action in one column: book, or why not, or nothing once booked', () => {
    const marie = employeeRow({
      requirements: [
        need('A-OPEN', 'OPEN'),
        need('B-NONE', 'NONE'),
        need('C-FULL', 'FULL'),
        { ...BOZP, courseCode: 'D-BOOKED' },
      ],
    })
    renderClient(
      <MembersTable
        name="Laboratoře"
        members={page([marie])}
        onPageChange={() => undefined}
        other="position"
        canBook
      />
    )
    const items = within(screen.getByRole('table')).getAllByRole('listitem')
    // Each item a row of the same three columns (badge, course, action), so the actions align.
    for (const item of items) {
      expect(item.className).toContain('grid-cols-subgrid')
      expect(item.children).toHaveLength(3)
    }
    const action = (course: string) => {
      const item = items.find(i => i.textContent.includes(course))
      return item?.lastElementChild?.querySelector('button') ?? null
    }
    expect(action('Course A-OPEN')?.getAttribute('aria-disabled')).toBeNull()
    expect(reasonOf(action('Course B-NONE') as HTMLElement)).toBe(
      'No session of this course is scheduled'
    )
    expect(reasonOf(action('Course C-FULL') as HTMLElement)).toBe(
      'Every session of this course is full'
    )
    expect(action('Course D-BOOKED')).toBeNull()
  })

  it('offer readers no action', () => {
    renderClient(
      <MembersTable
        name="Laboratoře"
        members={page([employeeRow({ requirements: [need('A-OPEN', 'OPEN')] })])}
        onPageChange={() => undefined}
        other="position"
        canBook={false}
      />
    )
    expect(screen.queryByRole('button', { name: /^Book / })).toBeNull()
  })
})

describe('a person’s row', () => {
  it('books every training they need, or says why none can be', () => {
    const rows = [
      employeeRow({ requirements: [need('A', 'NONE'), need('B', 'OPEN')] }),
      employeeRow({
        id: 'emp_E2',
        externalId: 'E2',
        lastName: 'Bílá',
        firstName: 'Jana',
        requirements: [need('A', 'NONE'), need('B', 'FULL')],
      }),
      employeeRow({
        id: 'emp_E3',
        externalId: 'E3',
        lastName: 'Adámek',
        firstName: 'Petr',
        status: 'PARENTAL_LEAVE',
        requirements: [need('A', 'OPEN')],
      }),
    ]
    renderClient(<EmployeesTable items={rows} paging={{ local: 'a test' }} canBook />)
    const book = (name: string) =>
      screen.getByRole('button', { name: `Book every training ${name} needs…` })
    expect(book('Černá Marie').getAttribute('aria-disabled')).toBeNull()
    expect(reasonOf(book('Bílá Jana'))).toBe(
      'No session with a free seat for the trainings they need'
    )
    expect(reasonOf(book('Adámek Petr'))).toBe(
      'On parental leave: nothing to book until they are back'
    )
  })
})
