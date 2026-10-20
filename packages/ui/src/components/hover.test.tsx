import { describe, expect, it } from 'vitest'

import { HeatCell } from '../charts/heat-cell'
import { render } from '../test/render'
import { Button } from './actions/button'
import { IconButton } from './actions/icon-button'
import { TextLink } from './actions/text-link'
import { StatCard } from './display/stat-card'
import { Checkbox, SelectBox } from './forms/checkbox'
import { ChoiceGroup } from './forms/choice-group'
import { Dropzone } from './forms/dropzone'
import { DatePicker } from './forms/pickers/date-picker'
import { TimePicker } from './forms/pickers/time-picker'
import { SegmentedControl } from './forms/segmented-control'
import { Select } from './forms/select'
import { LinkTab, LinkTabs, NavItem } from './layout/nav'
import { Tabs, TabsList, TabsTrigger } from './layout/tabs'
import { createDataColumns, DataTable } from './table/data-table'
import { ExpandButton } from './table/expand-button'
import { Pagination } from './table/pagination'

const noop = () => undefined
const PAGE_LABELS = { nav: 'Pages', previous: 'Previous', next: 'Next', status: 'Page 2 of 3' }
const DATE_LABELS = {
  open: 'Choose date',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  previousYear: 'Previous year',
  nextYear: 'Next year',
  today: 'Today',
  clear: 'Clear',
  format: { day: 'dd', month: 'mm', year: 'rrrr' },
}

const col = createDataColumns<{ name: string }>()

/** Every control the kit draws, once, as an app would. */
function Controls() {
  return (
    <>
      {(['primary', 'secondary', 'ghost', 'danger', 'destructive'] as const).map(variant => (
        <Button key={variant} variant={variant}>
          {variant}
        </Button>
      ))}
      <IconButton label="Edit">✎</IconButton>
      <IconButton label="Archive" tone="danger">
        ✕
      </IconButton>
      <SegmentedControl
        label="Theme"
        value="light"
        onValueChange={noop}
        items={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <ExpandButton open={false} aria-label="Open" />
      <SelectBox checked={false} onCheckedChange={noop} aria-label="Pick" />
      <Checkbox label="Agree" />
      <ChoiceGroup
        label="Resolve"
        value="a"
        onValueChange={noop}
        choices={[
          { value: 'a', title: 'A' },
          { value: 'b', title: 'B' },
        ]}
      />
      <Select aria-label="Room" options={[{ value: 'a', label: 'A' }]} />
      <DatePicker locale="en" labels={DATE_LABELS} />
      <TimePicker labels={{ open: 'Choose time', hours: 'Hours', minutes: 'Minutes' }} />
      <Dropzone title="Files" onFiles={noop} />
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
      </Tabs>
      <LinkTabs aria-label="Views">
        <LinkTab href="#a" active>
          A
        </LinkTab>
        <LinkTab href="#b">B</LinkTab>
      </LinkTabs>
      <NavItem href="#n">Nav</NavItem>
      <Pagination page={2} pageCount={3} labels={PAGE_LABELS} onPageChange={noop} />
      <TextLink href="#t">Link</TextLink>
      <StatCard label="Due" value="3" href="#s" />
      <StatCard label="Due" value="3" onClick={noop} pressed={false} />
      <HeatCell band="HIGH" tooltip="Lab" onClick={noop}>
        90 %
      </HeatCell>
      <DataTable
        caption="People"
        columns={col.columns([col.accessor('name', { header: 'Name', sortFn: 'text' })])}
        data={[{ name: 'Jana' }]}
        getRowId={r => r.name}
        paging={{ local: 'a test' }}
        paginationLabels={{ ...PAGE_LABELS, status: () => '' }}
      />
    </>
  )
}

/** What a pointer can act on: buttons, links, radios, checkboxes, comboboxes, a drop zone. */
const INTERACTIVE =
  'button:not([disabled]), a[href], [role="radio"], [role="checkbox"], [role="combobox"], [role="tab"], label:has(input[type="file"])'

/**
 * Whether the element shows the pointer is on it: a fill, a border, a ring or shadow, or an
 * underline that changes on hover. A text colour alone is too faint to count (the theme and
 * language switches had only that).
 */
const SHOWS = /^(?:bg-|border-|shadow|inset-ring|ring|layer-|underline)/
const hasHover = (el: Element) =>
  el.className.split(/\s+/).some(c => {
    const parts = c.split(':')
    return parts.slice(0, -1).includes('hover') && SHOWS.test(parts.at(-1) ?? '')
  })

describe('hover', () => {
  it('every control the kit draws answers the pointer', () => {
    const { container } = render(<Controls />)
    const controls = [...container.querySelectorAll(INTERACTIVE)]
    expect(controls.length).toBeGreaterThanOrEqual(25)
    const silent = controls
      .filter(el => !hasHover(el))
      .map(el => `${el.tagName.toLowerCase()} "${el.textContent || el.getAttribute('aria-label')}"`)
    expect(silent).toEqual([])
  })
})
