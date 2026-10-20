'use client'

import { choicesOf, isProposed, type PlanItem, seatsFree } from '@muni/domain/advisor'
import { SelectBox } from '@muni/ui/checkbox'
import { Select } from '@muni/ui/select'
import { Td, Tr } from '@muni/ui/table'
import { formatCurrency, formatSessionTime } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import { ComplianceBadge } from '@/components/badges/status-badges'

import { ChoiceFacts, UnplacedCell } from './choice-cells'
import type { BookingDraft } from './use-booking-draft'

/**
 * One training in the Book… dialog: whether it is booked (with several), the person, the
 * course and its state, the session it goes on (a choice among the proposal and the
 * alternatives, with what it means) or why there is none, and the price.
 */
export function BookingRow({
  item,
  draft,
  asOf,
}: {
  item: PlanItem
  draft: BookingDraft
  asOf: string
}) {
  const t = useTranslations('bookings.dialog')
  const tb = useTranslations('bookings')
  const { employee, course } = item.need
  const choice = isProposed(item) ? draft.choiceOf(item) : null
  return (
    <Tr>
      {draft.pickable && (
        <Td>
          {choice && (
            <SelectBox
              checked={draft.included(item)}
              onCheckedChange={on => {
                draft.include(item, on)
              }}
              aria-label={t('include', { name: employee.name, course: course.name })}
            />
          )}
        </Td>
      )}
      <Td nowrap>{employee.name}</Td>
      <Td>
        <div className="flex flex-col items-start gap-1">
          {course.name}
          <ComplianceBadge status={item.need.status} />
        </div>
      </Td>
      <Td>
        {choice && isProposed(item) ? (
          <div className="flex min-w-60 flex-col gap-1">
            <Select
              size="sm"
              aria-label={tb('sessionFor', { name: employee.name })}
              value={choice.session.externalId}
              onValueChange={sessionId => {
                draft.choose(item, sessionId)
              }}
              options={choicesOf(item).map(c => {
                const label = tb('choice', {
                  date: formatSessionTime(c.session),
                  room: c.session.room.name,
                  free: Math.max(0, seatsFree(c.session)),
                })
                return {
                  value: c.session.externalId,
                  label: c.window === null ? label : tb('choiceLate', { choice: label }),
                }
              })}
            />
            <ChoiceFacts choice={choice} asOf={asOf} />
          </div>
        ) : (
          <UnplacedCell item={item} />
        )}
      </Td>
      <Td align="right" nowrap>
        {formatCurrency(choice?.session.pricePerPerson)}
      </Td>
    </Tr>
  )
}
