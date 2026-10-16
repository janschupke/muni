import { SignUp } from '@clerk/nextjs'

/** Anyone may register; a new account reads with personal data redacted until given a role. */
export default function SignUpPage() {
  return (
    <div className="flex justify-center py-8">
      <SignUp />
    </div>
  )
}
