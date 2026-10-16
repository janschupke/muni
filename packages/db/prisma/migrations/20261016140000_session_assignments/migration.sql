-- Named bookings become rows; the booked total is derived (unnamed seats + assignments).

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('ADVISOR', 'MANUAL');

-- Every booking that exists today came from the export without a name: keep the counts.
-- (Prisma's diff would drop and re-add the column, losing the data.)
ALTER TABLE "course_sessions" RENAME COLUMN "booked_count" TO "unnamed_bookings";

-- CHECK constraints are not expressible in the Prisma schema; they live here.
ALTER TABLE "course_sessions"
  ADD CONSTRAINT "course_sessions_capacity_check" CHECK ("capacity" >= 0),
  ADD CONSTRAINT "course_sessions_unnamed_bookings_check" CHECK ("unnamed_bookings" >= 0);

-- CreateTable
CREATE TABLE "session_assignments" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "source" "AssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "score" DECIMAL(8,2),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_assignments_employee_id_idx" ON "session_assignments"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_assignments_session_id_employee_id_key" ON "session_assignments"("session_id", "employee_id");

-- AddForeignKey
ALTER TABLE "session_assignments" ADD CONSTRAINT "session_assignments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "course_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_assignments" ADD CONSTRAINT "session_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
