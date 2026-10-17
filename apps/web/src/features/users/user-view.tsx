'use client'

import { Badge } from '@muni/ui/badge'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import { formatDateTime, formatInteger, PLACEHOLDER } from '@muni/utils/format'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'

import { BackLink } from '@/components/back-link'
import { ConfirmArchiveButton } from '@/components/confirm-archive-button'
import { ReadView } from '@/components/read-view'
import { DetailSkeleton } from '@/components/skeletons'
import { RoleForm } from '@/features/users/role-form'
import { readQuery } from '@/lib/query/queries'
import { useDocumentTitle } from '@/lib/query/use-document-title'
import { saveUserRole } from '@/server/actions/users'
import type { ReadOutput } from '@/server/reads/registry'

export function UserView({ id }: { id: string }) {
  const read = useQuery(readQuery('user', { id }))
  useDocumentTitle(
    read.data && (read.data.user.name ?? read.data.user.email ?? read.data.user.clerkId)
  )
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />}>
      {data => <UserDetail data={data} />}
    </ReadView>
  )
}

function UserDetail({ data }: { data: ReadOutput<'user'> }) {
  const { user, self } = data
  const t = useTranslations('users')
  const tr = useTranslations('status.role')
  const locale = useLocale()
  const name = user.name ?? user.email ?? user.clerkId
  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: '/users', label: t('title') }} />}
        title={name}
        description={
          <Badge tone={user.role === 'ADMIN' ? 'accent' : 'neutral'}>{tr(user.role)}</Badge>
        }
        actions={
          !self && <ConfirmArchiveButton kind="user" id={user.id} name={name} then="/users" />
        }
      />
      <SplitLayout
        side={
          <Card>
            <CardHeader title={t('detail.facts')} />
            <CardBody>
              <DescriptionList>
                <DescriptionItem label={t('detail.email')}>
                  {user.email ?? PLACEHOLDER}
                </DescriptionItem>
                <DescriptionItem label={t('detail.lastSignIn')}>
                  {user.lastSignInAt ? formatDateTime(user.lastSignInAt, locale) : PLACEHOLDER}
                </DescriptionItem>
                <DescriptionItem label={t('detail.since')}>
                  {formatDateTime(user.createdAt, locale)}
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
