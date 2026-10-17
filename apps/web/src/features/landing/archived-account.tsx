import { SignOutButton } from '@clerk/nextjs'
import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { PageHeader } from '@muni/ui/page-header'
import { LogOut } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

/** What a signed-in user sees once an admin has archived them: no data, a way out. */
export async function ArchivedAccount() {
  const t = await getTranslations('landing.archived')
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-5 py-6 lg:py-12">
      <PageHeader title={t('title')} />
      <Alert tone="warning">{t('body')}</Alert>
      <SignOutButton>
        <Button>
          <LogOut aria-hidden />
          {t('signOut')}
        </Button>
      </SignOutButton>
    </div>
  )
}
