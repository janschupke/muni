-- A provider's details, filled in the app. Existing providers keep their name and get the
-- rest empty; their timestamps start now.
ALTER TABLE "providers"
    ADD COLUMN "company_id" TEXT,
    ADD COLUMN "email" TEXT,
    ADD COLUMN "phone" TEXT,
    ADD COLUMN "website" TEXT,
    ADD COLUMN "note" TEXT,
    ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD CONSTRAINT "providers_company_id_check" CHECK ("company_id" ~ '^[0-9]{8}$');

-- Prisma sets updated_at itself; the default only filled the existing rows.
ALTER TABLE "providers" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE UNIQUE INDEX "providers_company_id_key" ON "providers"("company_id");
