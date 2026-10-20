# Advisor

The `/advisor` page and the plan behind it.

`/advisor` shows every required training that is **non-compliant now** (expired or never
completed) or **lapses by the end of the sixth month**, counting the current one (the page
names that day: "Lapsing by Mar 31, 2027"), what is being done about each, and which
session would cover the rest. Every role can read it; admins book people from it and resolve
overbooked sessions, always through a dialog that shows what will happen first.

- **Breakdown** (the default view): one bar per bucket, "non-compliant now", then everything
  lapsing in the forecast together (`?bucket=upcoming`, the row the "Lapsing by …" card
  opens), then each of its months set in under it (the current one named by the days left in
  it, "Oct 18, 2026 – Oct 31, 2026"); each card's count is its row's. Each is split into **planned in time** (a named booking that ends before the
  training lapses), **planned with a gap** (the booking ends after it lapses, or it has already
  lapsed) and **action required** (nothing booked). Selecting a bucket lists its trainings with
  the **non-compliance window**: from the day the training lapses (`validUntil + 1`) until the
  booked session ends, or open when nothing is booked.
- **Action required**: the unbooked trainings in queue order, each with the proposed session and
  the gap it would leave, or the reason there is none and what to do. Booking works the same
  here and in the breakdown: **Book…** on a row, or rows picked and **Book N selected…**,
  opens the decision: each training with a session select (the proposal or one of up to five
  alternatives: other sessions with a free seat and no clash, those that end before the
  training lapses first), the price of each and the total, a box to leave one out, and, per
  session, people chosen against seats free (a session that would overfill stops the
  confirm). The confirm button names the count and the cost ("Book 3 trainings · 1 350,00
  Kč"); refusals the server finds are listed in the dialog, the rest are booked.
- **Remediation planned**: the booked trainings with their windows; cancelling one asks first.
- **Overbooked**: the sessions over capacity with the advisor's suggestion. **Resolve…**
  explains the session (booked by name and without a name, against capacity) and offers two
  ways: move seats booked without a name to sessions of the course the admin picks, how many
  to each (the suggestion fills it in; each capped at its seats free, the total at the seats
  without a name), or raise the capacity to fit everyone when the room has the seats. Either
  is one transaction (`moveSeatsMany`, `raiseCapacity`): every move goes through or none.

The plan is `planAssignments` in `packages/domain/src/advisor/plan.ts`, one fixed and deterministic
rule with no settings. The page prints the same rule:

1. People on parental leave are left out.
2. A named booking on an upcoming session of the course is a planned remediation.
3. Overbooked sessions first: their unnamed seats move to other sessions of the same course with
   room (named bookings never move), and those seats are not offered again.
4. Everything else is queued: expired (longest expired first), never completed, then by the day
   it lapses; ties go by name (Czech collation), employee ID and course code.
5. Each takes a session with a free seat that does not overlap the person's other bookings: the
   earliest one if the training has lapsed; otherwise the last one that ends before it lapses
   (retrain just in time), or the earliest one if none does.
6. Otherwise the reason is reported: `NO_SESSION`, `NO_SEATS` or `CONFLICT`. Courses short of
   sessions are listed.

Saving re-checks every pair on the server (seats under a row lock, clashes, the requirement,
and that the training has lapsed or lapses within the forecast); the browser's plan is never
trusted.
