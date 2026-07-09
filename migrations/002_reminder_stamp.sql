-- Reminder dedupe stamp for the hub's date_reminders protocol (manifest
-- `date_reminders` block, added in 1.1.0). The hub cron stamps the ISO
-- timestamp after emailing a row's reminder; a row is due again only once
-- the stamp predates the next occurrence's lead-days window, so each
-- occasion sends exactly one nudge per year. The `_at` suffix keeps the
-- column plaintext. App code never writes this column.
ALTER TABLE app_occasions__occasions ADD COLUMN last_reminded_at TEXT;
