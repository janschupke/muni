# Access and sensitive data

Who may see and change what, how roles are kept, and what the server hides from whom.

## Roles

Clerk signs people in (`/sign-in`) and up (`/sign-up`); sign-ups must be enabled in the Clerk
dashboard. The role lives in Clerk, in the user's **public metadata**: `{"role": "viewer"}`,
`"full"` or `"admin"`.

| Who      | Sees                                                        | How they get it                  |
| -------- | ----------------------------------------------------------- | -------------------------------- |
| Visitor  | the introduction on `/`, sign-in and sign-up; nothing else  | not signed in                    |
| `viewer` | every page, read-only, personal data redacted on the server | every new account, automatically |
| `full`   | every page, read-only, whole records                        | set in Clerk by an administrator |
| `admin`  | everything, plus editing, bookings, import and `/users`     | set in Clerk by an administrator |

The `users` table mirrors Clerk (`apps/web/src/server/auth.ts`). On each new sign-in (a new
Clerk session), and at most every five minutes after, the app reads the user from Clerk: a
missing or unknown role is written back as `viewer` (and `Full` as `full`), and the row is
updated with the role, email, name and last sign-in. If Clerk cannot be reached, the stored
role is used. Bookings record the user who made them.

To change a role, an admin opens the user from `/users` and saves the new role there: it is
written to Clerk's public metadata first, then to the users table (setting `role` in the Clerk
dashboard works too). It applies at the user's next sign-in, or within five minutes. Admins
cannot change their own role, and the last admin keeps theirs. An archived user is refused
everything; the home page tells them their access has ended.

Enforcement is on the server, in three layers: `proxy.ts` sends visitors to sign-in on every
path except `/`, `/sign-in` and `/sign-up`; every page calls `requireReader()` (or
`requireAdminPage()`, a 404 for non-admins) before reading data; every server action calls
`requireAdmin()`.

## Sensitive data

Fields listed in `packages/domain/src/sanitize/sanitize.config.ts` go through a policy before
they leave the server. Each field has a rule per role (`VIEWER`, `FULL`, `ADMIN`): `show`,
`omit`, `mask` (`keepFirst`/`keepLast`) or `maskEmail`. Defaults: for viewers the birth number
and notes are omitted and the email is masked; `full` and `admin` see whole records. Prices
are shown to everyone.

Override per deployment with `MUNI_SANITIZE_POLICY` (JSON, merged per field and role):

```sh
MUNI_SANITIZE_POLICY='{"employee.email":{"VIEWER":{"mode":"omit"}}}'
```

An invalid override (unknown field or mode, masking a number) throws on first use instead
of falling back. So does a rule for `ADMIN` other than `show`: admins edit these fields, and
their forms read them whole, so the policy cannot hide anything from them. Repositories in `@muni/db/repositories` apply the policy; pages never read
Prisma models directly.
