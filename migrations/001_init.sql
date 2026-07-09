-- Occasions — one shared household list of recurring important dates.
--
-- Each row is one annually-recurring occasion (a birthday, anniversary,
-- memorial, holiday, or gift reminder). The recurrence anchor is (event_month,
-- event_day); event_year is optional and used only to show an age / "years
-- since". "Upcoming" is computed client-side from month/day so leap-day and
-- year-boundary handling stay in tested pure logic (src/logic.js) rather than
-- in SQL.
--
-- Access: the `occasions` row policy is owner_or_visibility with
-- write_visibility_scoped (manifest.json). A member owns what they create;
-- `visibility = 'everyone'` shares an occasion with the whole household (the
-- default — most dates are shared), while `visibility = 'private'` keeps it to
-- its owner (e.g. a surprise-gift reminder). write_visibility_scoped means a
-- member may only edit/delete rows they can actually see, so nobody can
-- blind-write or delete another member's private occasion via raw /api/db.
--
-- Columns kept plaintext for SQL use (see manifest.db_plaintext_columns):
--   kind, source — filtered/grouped in the AI export and never sensitive.
-- event_month / event_day / event_year / lead_days are INTEGER and so are not
-- encrypted; the AI export orders by (event_month, event_day). title / notes /
-- gift_idea are encrypted at rest and only ever displayed, never sorted in SQL.
--
-- lead_days is the reminder lead time (how many days before the date a future
-- premium email nudge would fire). It has no effect today — the reminder cron
-- is a follow-up — but is stored per-row so that wiring is drop-in later.
CREATE TABLE IF NOT EXISTS app_occasions__occasions (
  id          TEXT    PRIMARY KEY,
  member_id   TEXT    NOT NULL,                      -- owner (creator)
  kind        TEXT    NOT NULL DEFAULT 'birthday',   -- birthday|anniversary|memorial|holiday|gift|other
  title       TEXT    NOT NULL DEFAULT '',           -- who/what, e.g. "Mom" or "Our Anniversary"
  event_month INTEGER NOT NULL CHECK (event_month BETWEEN 1 AND 12),
  event_day   INTEGER NOT NULL CHECK (event_day BETWEEN 1 AND 31),
  event_year  INTEGER,                               -- optional origin year (age / years-since)
  visibility  TEXT    NOT NULL DEFAULT 'everyone',   -- everyone|private
  notes       TEXT    NOT NULL DEFAULT '',
  gift_idea   TEXT    NOT NULL DEFAULT '',           -- optional gift note (pairs with wishlist)
  lead_days   INTEGER NOT NULL DEFAULT 3 CHECK (lead_days >= 0),
  source      TEXT    NOT NULL DEFAULT 'manual',     -- manual|contacts (provenance)
  source_ref  TEXT    NOT NULL DEFAULT '',           -- source contact id when imported from Contacts
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS app_occasions__occasions_when_idx
  ON app_occasions__occasions (event_month, event_day);

CREATE INDEX IF NOT EXISTS app_occasions__occasions_member_idx
  ON app_occasions__occasions (member_id);
