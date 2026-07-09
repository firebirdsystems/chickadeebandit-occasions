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

## Reminders (premium — follow-up)

Free today: the in-app upcoming list and countdowns. A premium email nudge
("Grandma's birthday is in 3 days") is intended as a follow-up once the hub grows
a date-anchored reminder cron; `lead_days` is already stored per occasion so that
wiring is drop-in. The two existing hub cron protocols (`inactivity_alerts`,
`digest`) are silence/cadence based and don't fit fixed annual dates, so nothing
half-working is wired up in the meantime.
