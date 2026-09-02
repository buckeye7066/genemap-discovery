-- Email identity must be case-insensitive at the database boundary as well as
-- in the API. Abort with a clear remediation target if historical out-of-band
-- writes created identities that would collapse to the same canonical email.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    GROUP BY lower(btrim("email"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enable case-insensitive user email uniqueness: canonical duplicates exist';
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE "users"
  ALTER COLUMN "email" TYPE CITEXT
  USING lower(btrim("email"))::citext;
