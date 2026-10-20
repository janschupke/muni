'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { BackLink } from '@/components/navigation/back-link'
import { FORM_READ, readQuery } from '@/lib/query/queries'
import type { ReadInput, ReadName, ReadOutput } from '@/server/reads/core/registry'

import type { FormProps } from './form-props'

/** A form's read: fresh on every visit, dropped once the form closes (`FORM_READ`). */
export function useFormRead<N extends ReadName>(
  name: N,
  input: ReadInput<N>
): UseQueryResult<ReadOutput<N>> {
  return useQuery({ ...readQuery(name, input), ...FORM_READ })
}

/**
 * What a form page hands its form: the save, and where Cancel and the back link lead (the
 * record, or the list or parent for a new one) with the heading. `isNew` makes it savable as
 * it is.
 */
export function formShell({
  action,
  back,
  title,
  description,
  isNew = false,
}: {
  action: FormProps['action']
  back: { href: string; label: string }
  title: string
  description?: string | undefined
  isNew?: boolean | undefined
}): FormProps {
  return {
    action,
    cancelHref: back.href,
    heading: { title, eyebrow: <BackLink fallback={back} />, description },
    isNew,
  }
}
