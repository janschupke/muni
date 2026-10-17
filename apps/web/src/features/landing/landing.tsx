import { ROLES } from '@muni/domain/enums'
import { Button } from '@muni/ui/button'
import { Card, CardBody } from '@muni/ui/card'
import { SectionHeading } from '@muni/ui/section-heading'
import { CalendarRange, Grid3x3, Lightbulb, LogIn, Upload, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

const FEATURES = [
  { key: 'compliance', Icon: Grid3x3 },
  { key: 'advisor', Icon: Lightbulb },
  { key: 'planner', Icon: CalendarRange },
  { key: 'import', Icon: Upload },
] as const

/** What visitors see instead of the register: what it is, and how to get in. No data. */
export async function Landing() {
  const t = await getTranslations('landing')
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-12 py-6 lg:py-12">
      <section className="flex flex-col items-start gap-5">
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-fg-muted">{t('lead')}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="primary">
            <Link href="/sign-in">
              <LogIn aria-hidden />
              {t('signIn')}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">
              <UserPlus aria-hidden />
              {t('signUp')}
            </Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="landing-features">
        <SectionHeading id="landing-features" className="mt-0">
          {t('features.title')}
        </SectionHeading>
        <ul className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map(({ key, Icon }) => (
            <li key={key}>
              <Card className="h-full">
                <CardBody className="flex gap-3">
                  <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-text" />
                  <div>
                    <h3 className="font-medium text-fg">{t(`features.${key}.title`)}</h3>
                    <p className="mt-1 text-sm text-fg-muted">{t(`features.${key}.body`)}</p>
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="landing-access">
        <SectionHeading id="landing-access" className="mt-0" description={t('access.description')}>
          {t('access.title')}
        </SectionHeading>
        <dl className="grid gap-3 sm:grid-cols-3">
          {ROLES.map(role => (
            <Card key={role} asChild className="p-4">
              <div>
                <dt className="font-medium text-fg">{t(`access.${role}.title`)}</dt>
                <dd className="mt-1 text-sm text-fg-muted">{t(`access.${role}.body`)}</dd>
              </div>
            </Card>
          ))}
        </dl>
      </section>
    </div>
  )
}
