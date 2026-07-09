# Occasions

One shared household list of the dates you don't want to miss — birthdays,
anniversaries, memorials, holidays, and gift reminders — sorted by what's coming
up next, with countdowns. Pull birthdays and anniversaries in from the Contacts
app, or add your own.

Most occasions are shared with the whole household; mark one **private** (a
surprise-gift reminder, say) and only you can see it.

---

## Quick start

```bash
npm run dev     # http://localhost:3001
npm test        # unit tests (date math, suggestions)
npm run build   # produces dist/bundle.json
```

## How it works

- **Storage:** one `occasions` table (see `migrations/001_init.sql`). Each row is
  an annually-recurring date anchored on `(event_month, event_day)`, with an
  optional `event_year` used only to show an age / "years since".
- **"Upcoming":** computed client-side in `src/logic.js` (`upcoming()`), so the
  leap-day and year-boundary handling is covered by unit tests rather than SQL.
- **Access:** the `occasions` row policy is `owner_or_visibility` with
  `write_visibility_scoped` — a member owns what they create, `everyone` rows are
  shared, `private` rows stay with their owner, and nobody can edit or delete a
  row they can't see.
- **Contacts integration:** reads the Contacts app's `contact_dates` export
  (declared in `data_access.reads`) to suggest birthdays/anniversaries you can add
  in one tap. If Contacts isn't installed the suggestions section is simply empty.

## Reminders (premium)

Free: the in-app upcoming list and countdowns. Premium (`cron` + `email`
capabilities): the hub's `date_reminders` protocol emails a nudge ("Grandma's
birthday is in 3 days") ahead of each occasion, delivered in the household's
local morning.

- Each occasion's **Email reminder** picker sets `lead_days` (day-of up to two
  weeks before). The value is always saved; emails only go out once the
  household holds the premium bundle — the app shows an upgrade note otherwise
  (via `GET api/reminders-status`).
- Recipients are **visibility-aware, enforced hub-side**: `everyone` occasions
  email the whole household; `private` occasions (surprise gifts) email only
  their owner.
- Dedupe: the cron stamps `last_reminded_at` (migration `002`) after a send, so
  each occasion nudges exactly once per occurrence, and re-arms for next year.
  App code never writes that column.
