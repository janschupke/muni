'use client'

import { type SessionOffer } from '@muni/domain/planner'
import { DetailGrid, DetailPanel } from '@muni/ui/detail-panel'
import { EmptyState } from '@muni/ui/empty-state'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
import { Table, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatDate, PLACEHOLDER } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import { Link } from '@/components/navigation/link'
import { RoomLink } from '@/features/sessions/session-links'

/** An opened offer: the people it is for, and the other rooms free at its slot. */
export function OfferDetails({ offer }: { offer: SessionOffer }) {
  const t = useTranslations('planner.expanded')
  const tr = useTranslations('planner.review')
  return (
    <DetailGrid layout="wide-narrow">
      <DetailPanel title={t('people')} count={offer.people.length} level={3} flush>
        <Table
          density="compact"
          paging="the people one session takes: bounded by its seats"
          aria-label={t('people')}
        >
          <THead>
            <tr>
              <Th>{t('person')}</Th>
              <Th>{t('department')}</Th>
              <Th>{t('lapses')}</Th>
            </tr>
          </THead>
          <TBody>
            {offer.people.map(p => (
              <Tr key={p.externalId}>
                <Td>
                  <TextLink asChild>
                    <Link href={`/employees/${p.externalId}`}>{p.name}</Link>
                  </TextLink>
                </Td>
                <Td>{p.department ?? PLACEHOLDER}</Td>
                <Td nowrap>{p.lapses ? formatDate(p.lapses) : tr('neverHeld')}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </DetailPanel>
      <DetailPanel title={t('rooms')} count={offer.alternatives.length} level={3}>
        {offer.alternatives.length === 0 ? (
          <EmptyState variant="inline" title={t('noRooms')} />
        ) : (
          <ItemList>
            {offer.alternatives.map(r => (
              <ItemListRow key={r.id}>
                <RoomLink room={r} />
              </ItemListRow>
            ))}
          </ItemList>
        )}
      </DetailPanel>
    </DetailGrid>
  )
}
