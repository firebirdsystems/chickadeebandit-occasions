-- AI read export: the household's occasions ordered by calendar position
-- (month, then day). Kept a simple single-table projection so it parses under
-- the occasions row policy; "next occurrence" / countdown is a plain function of
-- (event_month, event_day) that the caller can derive from these columns.
-- Runs under the owner_or_visibility policy, so a member-scoped token sees its
-- own private rows plus every shared (visibility = 'everyone') row; a
-- household-scoped token must pass a member_id.
SELECT
  id,
  kind,
  title,
  event_month,
  event_day,
  event_year,
  visibility,
  gift_idea,
  notes
FROM app_occasions__occasions
ORDER BY event_month, event_day
LIMIT 500
