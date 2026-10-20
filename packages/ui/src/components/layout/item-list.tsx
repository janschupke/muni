import type { HTMLAttributes } from 'react'

import { cn } from '../../cn'

/** A divided list of rows, each with its content on the left and details on the right. */
export function ItemList({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('divide-y divide-border-muted', className)} {...props} />
}

export function ItemListRow({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      className={cn('flex flex-wrap items-center justify-between gap-2 py-2 text-sm', className)}
      {...props}
    />
  )
}
