-- Archiving replaces deleting. Every record that carries history gets archived_at (and who
-- archived it); unique indexes skip archived rows so an archived name, code or ID never blocks
-- a new one; and every foreign key becomes RESTRICT, so no delete can wipe history in a cascade.

-- DropForeignKey
ALTER TABLE "course_capabilities" DROP CONSTRAINT "course_capabilities_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_completions" DROP CONSTRAINT "course_completions_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_completions" DROP CONSTRAINT "course_completions_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "course_completions" DROP CONSTRAINT "course_completions_provider_id_fkey";

-- DropForeignKey
ALTER TABLE "course_department_requirements" DROP CONSTRAINT "course_department_requirements_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_department_requirements" DROP CONSTRAINT "course_department_requirements_department_id_fkey";

-- DropForeignKey
ALTER TABLE "course_position_requirements" DROP CONSTRAINT "course_position_requirements_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_position_requirements" DROP CONSTRAINT "course_position_requirements_position_id_fkey";

-- DropForeignKey
ALTER TABLE "course_sessions" DROP CONSTRAINT "course_sessions_course_id_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_department_id_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_manager_id_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_position_id_fkey";

-- DropForeignKey
ALTER TABLE "room_capabilities" DROP CONSTRAINT "room_capabilities_room_id_fkey";

-- DropForeignKey
ALTER TABLE "session_assignments" DROP CONSTRAINT "session_assignments_session_id_fkey";

-- DropIndex
DROP INDEX "course_completions_external_id_key";

-- DropIndex
DROP INDEX "course_sessions_external_id_key";

-- DropIndex
DROP INDEX "courses_code_key";

-- DropIndex
DROP INDEX "departments_name_key";

-- DropIndex
DROP INDEX "employees_email_key";

-- DropIndex
DROP INDEX "employees_external_id_key";

-- DropIndex
DROP INDEX "positions_name_key";

-- DropIndex
DROP INDEX "providers_company_id_key";

-- DropIndex
DROP INDEX "providers_name_key";

-- DropIndex
DROP INDEX "rooms_name_key";

-- DropIndex
DROP INDEX "users_clerk_id_key";

-- AlterTable
ALTER TABLE "course_completions" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by_id" TEXT;

-- AlterTable
ALTER TABLE "course_sessions" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by_id" TEXT;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by_id" TEXT;

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by_id" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by_id" TEXT;

-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by_id" TEXT;

-- AlterTable
ALTER TABLE "providers" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by_id" TEXT;

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "course_completions_external_id_key" ON "course_completions"("external_id") WHERE ("archived_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "course_sessions_external_id_key" ON "course_sessions"("external_id") WHERE ("archived_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code") WHERE ("archived_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name") WHERE ("archived_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "employees_external_id_key" ON "employees"("external_id") WHERE ("archived_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email") WHERE ("archived_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "positions_name_key" ON "positions"("name") WHERE ("archived_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "providers_name_key" ON "providers"("name") WHERE ("archived_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "providers_company_id_key" ON "providers"("company_id") WHERE ("archived_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_name_key" ON "rooms"("name") WHERE ("archived_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_id_key" ON "users"("clerk_id") WHERE ("archived_at" IS NULL);

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_department_requirements" ADD CONSTRAINT "course_department_requirements_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_department_requirements" ADD CONSTRAINT "course_department_requirements_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_position_requirements" ADD CONSTRAINT "course_position_requirements_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_position_requirements" ADD CONSTRAINT "course_position_requirements_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_capabilities" ADD CONSTRAINT "course_capabilities_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_capabilities" ADD CONSTRAINT "room_capabilities_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_assignments" ADD CONSTRAINT "session_assignments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "course_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Archived and archived-by are set and cleared together.
ALTER TABLE "departments" ADD CONSTRAINT "departments_archived_check" CHECK (("archived_at" IS NULL) = ("archived_by_id" IS NULL));
ALTER TABLE "positions" ADD CONSTRAINT "positions_archived_check" CHECK (("archived_at" IS NULL) = ("archived_by_id" IS NULL));
ALTER TABLE "employees" ADD CONSTRAINT "employees_archived_check" CHECK (("archived_at" IS NULL) = ("archived_by_id" IS NULL));
ALTER TABLE "courses" ADD CONSTRAINT "courses_archived_check" CHECK (("archived_at" IS NULL) = ("archived_by_id" IS NULL));
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_archived_check" CHECK (("archived_at" IS NULL) = ("archived_by_id" IS NULL));
ALTER TABLE "providers" ADD CONSTRAINT "providers_archived_check" CHECK (("archived_at" IS NULL) = ("archived_by_id" IS NULL));
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_archived_check" CHECK (("archived_at" IS NULL) = ("archived_by_id" IS NULL));
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_archived_check" CHECK (("archived_at" IS NULL) = ("archived_by_id" IS NULL));
ALTER TABLE "users" ADD CONSTRAINT "users_archived_check" CHECK (("archived_at" IS NULL) = ("archived_by_id" IS NULL));
