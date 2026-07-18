-- Countdowns (1.2.0). Two additions on top of the recurring-occasion model:
--
-- 1. A one-off `kind = 'milestone'` — a single future date ("Disney trip"),
--    not an annual recurrence. Milestones store the full (event_year,
--    event_month, event_day) as the *target*; every other kind keeps treating
--    event_year as an optional origin year for age / "years since". SQLite
--    can't express "event_year is required only for milestones" as a CHECK on
--    an existing table, so the app enforces it (src/logic.js occasionTarget()
--    drops a milestone with no year, and the editor requires one).
--
-- 2. `countdown` — the opt-in flag that puts a row on the shared countdown
--    surfaces (the hub-rendered glance card, the kiosk ambient card, the
--    home-screen widgets). Off by default: the household's full list of dates
--    is not something everyone wants on a kitchen display. Only rows that are
--    ALSO visibility = 'everyone' can actually appear there — the ambient
--    kiosk/widget identities are not the owner, so the occasions row policy
--    (owner_or_visibility) filters private rows out regardless of this flag.
--    `countdown` is declared in db_plaintext_columns so `WHERE countdown = 1`
--    matches in the glance query.
--
-- `emoji` is the big visual on those surfaces (built-in plaintext column
-- name — never encrypted, so it survives the surfaces that read it natively).
-- `photo_file_id` is reserved for the kiosk photo variant (DESIGN-countdowns
-- ships emoji-only in v1); nothing writes it yet, but adding it here keeps the
-- photo work to a UI change rather than another migration.
ALTER TABLE app_occasions__occasions ADD COLUMN emoji TEXT NOT NULL DEFAULT '';
ALTER TABLE app_occasions__occasions ADD COLUMN countdown INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_occasions__occasions ADD COLUMN photo_file_id TEXT;

CREATE INDEX IF NOT EXISTS app_occasions__occasions_countdown_idx
  ON app_occasions__occasions (countdown, event_month, event_day);
