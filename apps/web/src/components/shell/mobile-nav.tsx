'use client'

import { Button } from '@muni/ui/button'
import { Drawer } from '@muni/ui/dialog'
import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { useOnMediaMatch } from '@/lib/use-media-match'

import { Nav, type NavGroup, type ShellLabels } from './nav'

/** Where the sidebar takes over from the drawer: Tailwind's `lg`. */
const DESKTOP = '(min-width: 64rem)'

/** The navigation drawer of small screens: it closes on any route change and at `lg`. */
export function MobileNav({ groups, labels }: { groups: NavGroup[]; labels: ShellLabels }) {
  const pathname = usePathname()
  const [drawer, setDrawer] = useState({ open: false, at: pathname })
  // A route change (a link, the back button) closes it: adjusted while rendering, as React
  // recommends for state that follows a prop.
  if (drawer.at !== pathname) setDrawer({ open: false, at: pathname })
  const close = () => {
    setDrawer(d => ({ ...d, open: false }))
  }

  // Widening past `lg` swaps the drawer for the sidebar, so it must not stay open behind it.
  useOnMediaMatch(DESKTOP, close)

  return (
    <Drawer
      open={drawer.open}
      onOpenChange={open => {
        setDrawer({ open, at: pathname })
      }}
      title={labels.menu}
      closeLabel={labels.close}
      trigger={
        <Button variant="ghost" size="icon" aria-label={labels.menu} className="lg:hidden">
          <Menu aria-hidden />
        </Button>
      }
    >
      <Nav groups={groups} label={labels.primary} onNavigate={close} />
    </Drawer>
  )
}
