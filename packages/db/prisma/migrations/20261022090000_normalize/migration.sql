-- Normalisation. A position exists in departments (department_positions), and a person's
-- department and position must be such a pair. A department's head is a flag on its member
-- (one per department). Whether someone has left is their leaving date reached, not a status.
-- The course needs set in the app are overrides next to the imported ones, not a freeze flag.
-- Names of departments, positions, providers and rooms ignore case. Single-row rules the app
-- already kept become CHECKs.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- Someone who left has a leaving date (every TERMINATED row has one); the date says it alone.
UPDATE "employees" SET "status" = 'ACTIVE' WHERE "status" = 'TERMINATED';

-- AlterEnum
BEGIN;
CREATE TYPE "EmploymentStatus_new" AS ENUM ('ACTIVE', 'PARENTAL_LEAVE');
ALTER TABLE "employees" ALTER COLUMN "status" TYPE "EmploymentStatus_new" USING ("status"::text::"EmploymentStatus_new");
ALTER TYPE "EmploymentStatus" RENAME TO "EmploymentStatus_old";
ALTER TYPE "EmploymentStatus_new" RENAME TO "EmploymentStatus";
DROP TYPE "public"."EmploymentStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "group_size_override" INTEGER,
ADD COLUMN     "online_allowed_override" BOOLEAN,
ADD COLUMN     "session_minutes_override" INTEGER;

-- Needs that were set in the app become overrides.
UPDATE "courses"
SET "session_minutes_override" = "session_minutes",
    "group_size_override" = "group_size",
    "online_allowed_override" = "online_allowed"
WHERE "needs_manual";

ALTER TABLE "courses" DROP COLUMN "needs_manual";

-- AlterTable
ALTER TABLE "departments" ALTER COLUMN "name" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "leads_department" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "positions" ALTER COLUMN "name" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "providers" ALTER COLUMN "name" SET DATA TYPE CITEXT;

-- AlterTable
ALTER TABLE "rooms" ALTER COLUMN "name" SET DATA TYPE CITEXT;

-- CreateTable
CREATE TABLE "department_positions" (
    "department_id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,

    CONSTRAINT "department_positions_pkey" PRIMARY KEY ("department_id","position_id")
);

-- Every pair someone holds today exists.
INSERT INTO "department_positions" ("department_id", "position_id")
SELECT DISTINCT "department_id", "position_id"
FROM "employees"
WHERE "department_id" IS NOT NULL AND "position_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "department_positions_position_id_idx" ON "department_positions"("position_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_department_head_key" ON "employees"("department_id") WHERE ("leads_department" = true AND "archived_at" IS NULL);

-- AddForeignKey
ALTER TABLE "department_positions" ADD CONSTRAINT "department_positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_positions" ADD CONSTRAINT "department_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_position_id_fkey" FOREIGN KEY ("department_id", "position_id") REFERENCES "department_positions"("department_id", "position_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A head is a member of the department they lead.
ALTER TABLE "employees" ADD CONSTRAINT "employees_head_member_check" CHECK (NOT "leads_department" OR "department_id" IS NOT NULL);
-- Nobody manages themselves (longer loops are refused by the app and dropped by imports).
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_check" CHECK ("manager_id" <> "id");
ALTER TABLE "employees" ADD CONSTRAINT "employees_left_on_check" CHECK ("left_on" >= "hired_on");
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_times_check" CHECK ("ends_at" > "starts_at");
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_price_check" CHECK ("price_per_person" >= 0);
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_valid_until_check" CHECK ("valid_until" >= "completed_on");
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_price_check" CHECK ("price" >= 0);
ALTER TABLE "courses" ADD CONSTRAINT "courses_validity_months_check" CHECK ("validity_months" > 0);
ALTER TABLE "courses" ADD CONSTRAINT "courses_session_minutes_override_check" CHECK ("session_minutes_override" > 0);
ALTER TABLE "courses" ADD CONSTRAINT "courses_group_size_override_check" CHECK ("group_size_override" > 0);
