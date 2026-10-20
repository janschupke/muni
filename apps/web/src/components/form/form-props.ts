import type { FormState } from '@/lib/form/form'

import type { FormHeading } from './form-shell'

type Action = (state: FormState, form: FormData) => Promise<FormState>

export interface FormProps {
  action: Action
  cancelHref: string
  heading: FormHeading
  /** A new record: savable as it is (an edit needs a change first). */
  isNew?: boolean | undefined
}

export interface Option {
  id: string
  name: string
}
