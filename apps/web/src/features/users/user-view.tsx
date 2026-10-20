'use client'

import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { SplitLayout } from '@muni/ui/layout'
import { formatDateTime, formatInteger, PLACEHOLDER } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'

import { EmailLink } from '@/components/badges/email-link'
import { RoleBadge } from '@/components/badges/status-badges'
import { ReadView } from '@/components/views/read-view'
import { RecordHeader, useRecordRead } from '@/components/views/record-view'
import { DetailSkeleton } from '@/components/views/skeletons'
import { RoleForm } from '@/features/users/role-form'
import { saveUserRole } from '@/server/actions/users'
import type { ReadOutput } from '@/server/reads/core/registry'

/** A user by what is known of them: their name, else their email, else their sign-in id. */
const nameOf = (user: { name: string | null; email: string | null; clerkId: string }) =>
  user.name ?? user.email ?? user.clerkId

export function UserView({ id }: { id: string }) {
  const read = useRecordRead('user', { id }, ({ user }) => nameOf(user))
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />} entity="users">
      {data => <UserDetail data={data} />}
    </ReadView>
  )
}

function UserDetail({ data }: { data: ReadOutput<'user'> }) {
  const { user, self } = data
  const t = useTranslations('users')
  const locale = useLocale()
  const name = nameOf(user)
  return (
    <>
      <RecordHeader
        list={{ href: '/users', label: t('title') }}
        title={name}
        description={<RoleBadge value={user.role} />}
        // Nobody archives themselves; a user has no form, only the role below.
        record={!self && { kind: 'user', id: user.id, name }}
      />
      <SplitLayout
        side={
          <Card>
            <CardHeader title={t('detail.facts')} />
            <CardBody>
              <DescriptionList>
                <DescriptionItem label={t('detail.email')}>
                  <EmailLink email={user.email} />
                </DescriptionItem>
                <DescriptionItem label={t('detail.lastSignIn')}>
                  {user.lastSignInAt ? formatDateTime(user.lastSignInAt) : PLACEHOLDER}
                </DescriptionItem>
                <DescriptionItem label={t('detail.since')}>
                  {formatDateTime(user.createdAt)}
                </DescriptionItem>
                <DescriptionItem label={t('detail.bookingsMade')}>
                  {formatInteger(user.bookingsMade, locale)}
                </DescriptionItem>
              </DescriptionList>
            </CardBody>
          </Card>
        }
        main={
          <Card>
            <CardHeader title={t('detail.role')} description={t('detail.roleHelp')} />
            <CardBody>
              <RoleForm
                action={saveUserRole.bind(null, user.id)}
                role={user.role}
                disabled={self}
              />
            </CardBody>
          </Card>
        }
      />
    </>
  )
}
