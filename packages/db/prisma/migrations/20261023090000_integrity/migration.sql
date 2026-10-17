-- An archived person is shown by a random tag instead of one derived from their internal id
-- (which every reader receives, so a derived tag could be matched back). The database sets
-- the tag whenever a row is archived and clears it when the row comes back, so no writer can
-- forget it; the CHECK holds it.
ALTER TABLE "employees" ADD COLUMN "archive_tag" TEXT;
ALTER TABLE "users" ADD COLUMN "archive_tag" TEXT;

CREATE FUNCTION set_archive_tag() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.archived_at IS NULL THEN
    NEW.archive_tag := NULL;
  ELSIF NEW.archive_tag IS NULL THEN
    NEW.archive_tag := substr(md5(gen_random_uuid()::text), 1, 6);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER employees_archive_tag BEFORE INSERT OR UPDATE OF archived_at ON "employees"
  FOR EACH ROW EXECUTE FUNCTION set_archive_tag();
CREATE TRIGGER users_archive_tag BEFORE INSERT OR UPDATE OF archived_at ON "users"
  FOR EACH ROW EXECUTE FUNCTION set_archive_tag();

UPDATE "employees" SET "archive_tag" = substr(md5(gen_random_uuid()::text), 1, 6)
WHERE "archived_at" IS NOT NULL;
UPDATE "users" SET "archive_tag" = substr(md5(gen_random_uuid()::text), 1, 6)
WHERE "archived_at" IS NOT NULL;

ALTER TABLE "employees" ADD CONSTRAINT "employees_archive_tag_check"
  CHECK (("archived_at" IS NULL) = ("archive_tag" IS NULL));
ALTER TABLE "users" ADD CONSTRAINT "users_archive_tag_check"
  CHECK (("archived_at" IS NULL) = ("archive_tag" IS NULL));

-- When an admin last changed the role in the app: a sync that read Clerk before Clerk had the
-- change never writes the older role back.
ALTER TABLE "users" ADD COLUMN "role_changed_at" TIMESTAMP(3);
