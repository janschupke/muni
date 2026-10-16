-- Users, mirrored from Clerk. Bookings point at a user row instead of a raw Clerk id.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VIEWER', 'FULL', 'ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerk_id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "last_session_id" TEXT,
    "last_sign_in_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_id_key" ON "users"("clerk_id");

-- Everyone who has booked a seat gets a placeholder row. synced_at at the epoch makes their
-- next request read the details (and the role) from Clerk.
INSERT INTO "users" ("id", "clerk_id", "synced_at", "updated_at")
SELECT 'usr_' || md5("created_by"), "created_by", TIMESTAMP '1970-01-01', CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "created_by" FROM "session_assignments") AS authors;

-- AlterTable: point bookings at the rows, then drop the raw Clerk id.
ALTER TABLE "session_assignments" ADD COLUMN "created_by_id" TEXT;
UPDATE "session_assignments" SET "created_by_id" = 'usr_' || md5("created_by");
ALTER TABLE "session_assignments" ALTER COLUMN "created_by_id" SET NOT NULL;
ALTER TABLE "session_assignments" DROP COLUMN "created_by";

-- CreateIndex
CREATE INDEX "session_assignments_created_by_id_idx" ON "session_assignments"("created_by_id");

-- AddForeignKey
ALTER TABLE "session_assignments" ADD CONSTRAINT "session_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
