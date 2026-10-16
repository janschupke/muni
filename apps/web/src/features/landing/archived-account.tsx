import { SignOutButton } from '@clerk/nextjs'
import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { LogOut } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

/** What a signed-in user sees once an admin has archived them: no data, a way out. */
export async function ArchivedAccount() {
  const t = await getTranslations('landing.archived')
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-5 py-6 lg:py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{t('title')}</h1>
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
