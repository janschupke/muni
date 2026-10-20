import { CircleCheck, CircleX, Info, type LucideIcon, TriangleAlert } from 'lucide-react'

/** The four message tones alerts and toasts share. */
export type MessageTone = 'success' | 'info' | 'warning' | 'danger'

/** The icon that says each tone at a glance, the same wherever a message appears. */
export const TONE_ICON: Record<MessageTone, LucideIcon> = {
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  danger: CircleX,
}

/** The ink of each tone's text and icon. */
export const TONE_INK: Record<MessageTone, string> = {
  success: 'text-success-fg',
  info: 'text-info-fg',
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
}
