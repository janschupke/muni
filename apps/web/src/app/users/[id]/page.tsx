import { getUser } from '@muni/db/repositories'
import { Badge } from '@muni/ui/badge'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import { formatDateTime, formatInteger, PLACEHOLDER } from '@muni/utils/format'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { ConfirmArchiveButton } from '@/components/confirm-archive-button'
import { RoleForm } from '@/features/users/role-form'
import { saveUserRole } from '@/server/actions/users'
import { requireAdminPage } from '@/server/auth'

/** One user, for admins: their account, their role (changed here, stored in Clerk), archiving. */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage()
  const { id } = await params
  const [user, t, tr, locale] = await Promise.all([
    getUser(id),
    getTranslations('users'),
    getTranslations('status.role'),
    getLocale(),
  ])
  if (!user) notFound()
  const name = user.name ?? user.email ?? user.clerkId
  const self = user.id === admin.id
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
