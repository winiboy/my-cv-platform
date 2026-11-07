-- ============================================================================
-- 010_cover_letter_sender_details.sql
--
-- Adds the sender's details and the enclosures line to public.cover_letters,
-- for the Swiss business-letter format
-- (tasks/prds/cover-letter-swiss-format.md, US-001).
--
-- Until now the only sender column was sender_name. A Swiss letter also
-- prints, at top left, the sender's street, postcode and locality, phone and
-- e-mail, and closes with an "Annexes" block. Five columns, all nullable text:
--
--   sender_street           street and number
--   sender_postal_locality  postcode and locality, e.g. "1003 Lausanne"; the
--                           letter's "place, date" line is derived from it
--   sender_phone
--   sender_email
--   annexes                 the enclosures list, as the user wrote it
--
-- annexes carries a distinction the others do not: NULL means "not set", and
-- the letter prints the default list in its own language; an empty string is
-- a list the user cleared on purpose, and the letter prints no Annexes block.
-- Nothing may coerce one into the other, which is why the column has no
-- default and no NOT NULL.
--
-- ADDITIVE ONLY. No default and no backfill: every existing row keeps every
-- value it has and gets NULL in the new columns, which reads as "not set".
-- ADD COLUMN IF NOT EXISTS makes the file safe to re-apply.
--
-- NO LENGTH CHECK CONSTRAINTS, deliberately, as no text column of this table
-- has one. The limits live in COVER_LETTER_FIELD_LIMITS
-- (src/lib/cover-letter-limits.ts), with the e-mail format, in one zod shape
-- (coverLetterSenderFieldsShape, src/lib/cover-letter-sender.ts). That shape
-- is enforced by the create and update APIs and, since this story, by the
-- editor before its direct, RLS-scoped write to this table; printing is
-- bounded separately by COVER_LETTER_PDF_GUARD. Moving the editor's save to
-- the API, so that one server-side check covers every write, is recorded as
-- debt.
--
-- In the sender detail columns NULL means "never set": the letter falls back
-- to its linked CV's contact (effectiveSenderDetails). The empty string is a
-- field the user cleared, and stays empty.
--
-- NO POLICY CHANGE. The cover_letters policies (003_cover_letters.sql) are
-- row-level and restrict every row, and so every column of it, to its owner
-- (auth.uid() = user_id); new columns are covered as they are.
--
-- Once deployed this file is frozen; a later correction gets its own forward
-- migration.
-- ============================================================================

ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS sender_street TEXT,
  ADD COLUMN IF NOT EXISTS sender_postal_locality TEXT,
  ADD COLUMN IF NOT EXISTS sender_phone TEXT,
  ADD COLUMN IF NOT EXISTS sender_email TEXT,
  ADD COLUMN IF NOT EXISTS annexes TEXT;

COMMENT ON COLUMN public.cover_letters.sender_street IS
  'Sender street and number, printed in the sender block.';
COMMENT ON COLUMN public.cover_letters.sender_postal_locality IS
  'Sender postcode and locality, e.g. "1003 Lausanne"; the place of the place-and-date line is derived from it.';
COMMENT ON COLUMN public.cover_letters.sender_phone IS
  'Sender phone number, printed in the sender block.';
COMMENT ON COLUMN public.cover_letters.sender_email IS
  'Sender e-mail address, printed in the sender block.';
COMMENT ON COLUMN public.cover_letters.annexes IS
  'Enclosures list as written by the user. NULL: the default list in the letter''s language. Empty string: no Annexes block.';
