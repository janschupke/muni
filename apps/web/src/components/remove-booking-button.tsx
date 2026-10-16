'use client'

import { IconButton } from '@muni/ui/icon-button'
import { X } from 'lucide-react'
import { useTransition } from 'react'

import { removeAssignmentAction } from '@/server/actions/assignments'

/** Cancels one named booking (signed-in users only; the action checks again). */
export function RemoveBookingButton({
  sessionExternalId,
  employeeExternalId,
  label,
}: {
  sessionExternalId: string
  employeeExternalId: string
  label: string
}) {
  const [pending, startTransition] = useTransition()
  return (
    <IconButton
      label={label}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await removeAssignmentAction({ sessionExternalId, employeeExternalId })
        })
      }}
    >
      <X aria-hidden />
    </IconButton>
  )
}
