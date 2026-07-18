/**
 * Pure business logic for the Occasions app.
 * No DOM, no fetch — importable in both browser and test environments.
 *
 * Dates are handled as (month, day) pairs anchoring an annually-recurring
 * occasion, with an optional origin year for age / "years since". All the
 * leap-day and year-boundary handling lives here so it can be unit-tested.
 */

export const KINDS = [
  { value: "birthday",    label: "Birthday",    icon: "🎂" },
  { value: "anniversary", label: "Anniversary", icon: "💍" },
  { value: "memorial",    label: "Memorial",    icon: "🕊️" },
  { value: "holiday",     label: "Holiday",     icon: "🎉" },
  { value: "gift",        label: "Gift",        icon: "🎁" },
  { value: "milestone",   label: "Countdown",   icon: "⏳" },
  { value: "other",       label: "Other",       icon: "📌" },
];

/** The one-off kind: a single dated event ("Disney trip"), not an annual
 *  recurrence. Its event_year is the target year, not an origin year. */
export const MILESTONE_KIND = "milestone";

export function isMilestone(occasion) {
  return occasion?.kind === MILESTONE_KIND;
}

const KIND_BY_VALUE = new Map(KINDS.map((k) => [k.value, k]));

export function kindMeta(kind) {
  return KIND_BY_VALUE.get(kind) ?? { value: "other", label: "Other", icon: "📌" };
}

/** Days in a given month (1-12) of a given year, honoring leap years. */
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Build a local Date at noon (avoids DST edge cases) for year/month/day,
 * clamping the day to the month's length so Feb 29 becomes Feb 28 in a
 * non-leap year instead of silently rolling over into March.
 */
export function makeDate(year, month, day) {
  const clampedDay = Math.min(day, daysInMonth(year, month));
  return new Date(year, month - 1, clampedDay, 12, 0, 0, 0);
}

/** Local yyyy-mm-dd, deliberately not UTC: editor validation follows the
 * user's calendar day even when UTC has already crossed midnight. */
export function localDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** A Date reduced to local midnight — for whole-day comparisons/arithmetic. */
function atMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Parse a stored date string into { month, day, year|null }.
 * Accepts "YYYY-MM-DD", "MM-DD", vCard "--MMDD" / "--MM-DD", and "YYYYMMDD".
 * Returns null when no usable month/day can be read.
 */
export function parseDateParts(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  let m;
  // YYYY-MM-DD or YYYY/MM/DD
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/))) {
    return normalizeParts(Number(m[2]), Number(m[3]), Number(m[1]));
  }
  // vCard --MM-DD or --MMDD (no year)
  if ((m = s.match(/^--(\d{2})-?(\d{2})$/))) {
    return normalizeParts(Number(m[1]), Number(m[2]), null);
  }
  // YYYYMMDD
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    return normalizeParts(Number(m[2]), Number(m[3]), Number(m[1]));
  }
  // MM-DD or MM/DD (no year)
  if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})$/))) {
    return normalizeParts(Number(m[1]), Number(m[2]), null);
  }
  return null;
}

function normalizeParts(month, day, year) {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year != null && (!Number.isInteger(year) || year < 1 || year > 9999)) year = null;
  return { month, day, year: year ?? null };
}

/**
 * The next date on/after `from` on which (month, day) recurs.
 * If this year's occurrence has already passed, returns next year's.
 * `from` defaults to now.
 */
export function nextOccurrence(month, day, from = new Date()) {
  const today = atMidnight(from);
  let candidate = atMidnight(makeDate(today.getFullYear(), month, day));
  if (candidate < today) {
    candidate = atMidnight(makeDate(today.getFullYear() + 1, month, day));
  }
  return candidate;
}

/** Whole days from `from` until the next occurrence of (month, day). 0 = today. */
export function daysUntil(month, day, from = new Date()) {
  const next = nextOccurrence(month, day, from);
  const today = atMidnight(from);
  return Math.round((next - today) / 86400000);
}

/**
 * Years the occasion will have run at its next occurrence — an age for a
 * birthday, "Nth" for an anniversary. Null when no origin year is known, or
 * when the origin year is in the future of the next occurrence.
 */
export function yearsAtNext(month, day, year, from = new Date()) {
  if (year == null) return null;
  const next = nextOccurrence(month, day, from);
  const n = next.getFullYear() - year;
  return n >= 0 ? n : null;
}

function validMonthDay(month, day) {
  return Number.isInteger(month) && Number.isInteger(day)
    && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * The concrete date an occasion counts down to, as a local-midnight Date, or
 * null when the row can't produce one.
 *
 * Milestones are one-off: their stored (year, month, day) *is* the target, so
 * a milestone whose date has passed returns a date in the past (callers decide
 * whether to show it). Every other kind recurs annually, so the target is the
 * next occurrence on or after `from`.
 */
export function occasionTarget(occasion, from = new Date()) {
  const month = Number(occasion?.event_month);
  const day = Number(occasion?.event_day);
  if (!validMonthDay(month, day)) return null;
  if (isMilestone(occasion)) {
    const year = occasion.event_year != null ? Number(occasion.event_year) : null;
    if (!Number.isInteger(year)) return null; // a milestone without a year has no target
    return atMidnight(makeDate(year, month, day));
  }
  return nextOccurrence(month, day, from);
}

/** Whole days from `from` until an occasion's target. 0 = today, negative =
 *  a milestone that has already passed. Null when there's no usable target. */
export function daysUntilOccasion(occasion, from = new Date()) {
  const target = occasionTarget(occasion, from);
  if (!target) return null;
  return Math.round((target - atMidnight(from)) / 86400000);
}

/** Human countdown label: "Today", "Tomorrow", "In 3 days", "In 2 weeks".
 *  Negative days only occur for a one-off milestone whose date has gone by. */
export function countdownLabel(days) {
  if (days < 0) return "Passed";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 14) return `In ${days} days`;
  if (days < 60) return `In ${Math.round(days / 7)} weeks`;
  if (days < 365) return `In ${Math.round(days / 30)} months`;
  return "In a year";
}

/** Decorate one occasion with its target date, day count and years-at-next.
 *  Returns null when the row has no usable target. */
function decorate(o, from) {
  const target = occasionTarget(o, from);
  if (!target) return null;
  const month = Number(o.event_month);
  const day = Number(o.event_day);
  return {
    ...o,
    _next: target,
    _days: Math.round((target - atMidnight(from)) / 86400000),
    _years: isMilestone(o)
      ? null
      : yearsAtNext(month, day, o.event_year != null ? Number(o.event_year) : null, from),
  };
}

/**
 * Decorate occasions with their next occurrence + countdown and sort soonest
 * first. Rows missing a valid month/day are dropped, as are milestones whose
 * date has already passed (they don't recur — see `passedMilestones`). Ties
 * broken by title.
 */
export function upcoming(occasions, from = new Date()) {
  return occasions
    .map((o) => decorate(o, from))
    .filter((o) => o && o._days >= 0)
    .sort((a, b) => a._days - b._days || String(a.title).localeCompare(String(b.title)));
}

/** One-off milestones whose date is in the past, most recent first. They stay
 *  in the list (nothing is auto-deleted) but out of the upcoming section. */
export function passedMilestones(occasions, from = new Date()) {
  return occasions
    .filter(isMilestone)
    .map((o) => decorate(o, from))
    .filter((o) => o && o._days < 0)
    .sort((a, b) => b._days - a._days || String(a.title).localeCompare(String(b.title)));
}

/**
 * The rows that appear on the shared countdown surfaces — the hub glance card,
 * the kiosk ambient card and the home-screen widgets — soonest first.
 *
 * Mirrors the hub-side glance query (manifest.glance) so the in-app "shown on
 * shared screens" preview and the surfaces agree: opted in via `countdown`,
 * visible to everyone (ambient identities are not the owner, so the row policy
 * would drop private rows anyway), and not already passed.
 */
export function countdownRows(occasions, from = new Date(), limit = 3) {
  return upcoming(occasions.filter((o) => Number(o?.countdown) === 1 && o?.visibility === "everyone"), from)
    .slice(0, limit);
}

/**
 * From the Contacts `contact_dates` export, produce add-suggestions for dates
 * not already represented by an occasion sourced from that contact.
 * Each contact contributes at most one birthday and one anniversary suggestion.
 * `existing` is the current occasions list (to dedupe on source_ref + kind).
 */
export function contactSuggestions(contactDates, existing) {
  const taken = new Set(
    existing
      .filter((o) => o.source === "contacts" && o.source_ref)
      .map((o) => `${o.source_ref}:${o.kind}`),
  );
  const out = [];
  for (const c of contactDates ?? []) {
    const id = c?.id;
    const name = (c?.name ?? "").trim();
    if (!id || !name) continue;
    for (const [field, kind] of [["birthday", "birthday"], ["anniversary", "anniversary"]]) {
      const parts = parseDateParts(c?.[field]);
      if (!parts) continue;
      if (taken.has(`${id}:${kind}`)) continue;
      out.push({
        contactId: id,
        name,
        kind,
        month: parts.month,
        day: parts.day,
        year: parts.year,
      });
    }
  }
  return out;
}
