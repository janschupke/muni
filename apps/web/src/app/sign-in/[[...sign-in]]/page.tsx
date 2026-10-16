import { SignIn } from '@clerk/nextjs'
import { notFound } from 'next/navigation'

import { clerkEnabled } from '@/server/clerk'

export default function SignInPage() {
  if (!clerkEnabled) notFound()
  return (
    <div className="flex justify-center py-8">
      <SignIn />
    </div>
  )
}
