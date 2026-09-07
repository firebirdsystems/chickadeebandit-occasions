import { describe, it, expect } from "vitest";
import {
  parseDateParts, makeDate, daysInMonth, nextOccurrence, daysUntil,
  yearsAtNext, countdownLabel, upcoming, contactSuggestions, kindMeta,
  isMilestone, occasionTarget, daysUntilOccasion, passedMilestones, countdownRows,
  localDateKey, MILESTONE_KIND, searchableFields,
  buildCalendarEvents, CALENDAR_EXPORT_HORIZON_DAYS, CALENDAR_EXPORT_MAX_EVENTS,
} from "../src/logic.js";

const at = (y, m, d) => new Date(y, m - 1, d, 9, 0, 0); // a "now" fixed at 9am local

describe("localDateKey", () => {
  it("formats the caller's local calendar date", () => {
    expect(localDateKey(at(2026, 7, 5))).toBe("2026-07-05");
  });
});

describe("parseDateParts", () => {
  it("parses YYYY-MM-DD with year", () => {
    expect(parseDateParts("1985-03-07")).toEqual({ month: 3, day: 7, year: 1985 });
  });
  it("parses MM-DD without a year", () => {
    expect(parseDateParts("12-25")).toEqual({ month: 12, day: 25, year: null });
  });
  it("parses vCard --MMDD and --MM-DD", () => {
    expect(parseDateParts("--0914")).toEqual({ month: 9, day: 14, year: null });
    expect(parseDateParts("--09-14")).toEqual({ month: 9, day: 14, year: null });
  });
  it("parses compact YYYYMMDD", () => {
    expect(parseDateParts("20100621")).toEqual({ month: 6, day: 21, year: 2010 });
  });
  it("rejects garbage and out-of-range values", () => {
    expect(parseDateParts("")).toBeNull();
    expect(parseDateParts("not a date")).toBeNull();
    expect(parseDateParts("2020-13-01")).toBeNull();
    expect(parseDateParts("2020-02-40")).toBeNull();
    expect(parseDateParts(null)).toBeNull();
  });
});

describe("makeDate / daysInMonth", () => {
  it("knows leap vs non-leap February", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
  });
  it("clamps Feb 29 to Feb 28 in a non-leap year", () => {
    const d = makeDate(2025, 2, 29);
    expect(d.getMonth()).toBe(1); // February, not March
    expect(d.getDate()).toBe(28);
  });
  it("keeps Feb 29 in a leap year", () => {
    const d = makeDate(2024, 2, 29);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(29);
  });
});

describe("nextOccurrence / daysUntil", () => {
  it("returns this year's date when it is still ahead", () => {
    const next = nextOccurrence(6, 21, at(2026, 1, 1));
    expect(next.getFullYear()).toBe(2026);
    expect(daysUntil(6, 21, at(2026, 1, 1))).toBeGreaterThan(0);
  });
  it("rolls to next year once the date has passed", () => {
    const next = nextOccurrence(1, 1, at(2026, 6, 1));
    expect(next.getFullYear()).toBe(2027);
  });
  it("counts a same-day occasion as 0 days away", () => {
    expect(daysUntil(3, 15, at(2026, 3, 15))).toBe(0);
  });
  it("counts tomorrow as 1 day away across a month boundary", () => {
    expect(daysUntil(4, 1, at(2026, 3, 31))).toBe(1);
  });
  it("counts a New Year's date the day before as 1 day away across the year boundary", () => {
    expect(daysUntil(1, 1, at(2026, 12, 31))).toBe(1);
  });
  it("clamps a Feb 29 birthday to Feb 28 in a non-leap year", () => {
    // From Feb 1 2025 (non-leap), the next Feb-29 occurrence is Feb 28 2025.
    const next = nextOccurrence(2, 29, at(2025, 2, 1));
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
    expect(daysUntil(2, 29, at(2025, 2, 1))).toBe(27);
  });
});

describe("yearsAtNext", () => {
  it("gives the age a birthday turns at its next occurrence", () => {
    // Birthday June 21 1959; from Jan 2026 the next is June 2026 → turns 67.
    expect(yearsAtNext(6, 21, 1959, at(2026, 1, 1))).toBe(67);
  });
  it("returns null when no origin year is known", () => {
    expect(yearsAtNext(12, 25, null, at(2026, 1, 1))).toBeNull();
  });
  it("returns null when the origin year is after the next occurrence", () => {
    expect(yearsAtNext(1, 1, 2999, at(2026, 6, 1))).toBeNull();
  });
});

describe("countdownLabel", () => {
  it("labels near dates", () => {
    expect(countdownLabel(0)).toBe("Today");
    expect(countdownLabel(1)).toBe("Tomorrow");
    expect(countdownLabel(3)).toBe("In 3 days");
  });
  it("labels a passed one-off milestone", () => {
    expect(countdownLabel(-1)).toBe("Passed");
    expect(countdownLabel(-400)).toBe("Passed");
  });
  it("labels farther dates in weeks/months", () => {
    expect(countdownLabel(21)).toBe("In 3 weeks");
    expect(countdownLabel(90)).toBe("In 3 months");
  });
});

describe("upcoming", () => {
  const rows = [
    { id: "a", title: "Later", event_month: 12, event_day: 31, event_year: null },
    { id: "b", title: "Soon", event_month: 1, event_day: 5, event_year: 2000 },
    { id: "c", title: "Broken", event_month: 99, event_day: 99, event_year: null },
  ];
  it("sorts soonest first and decorates with countdown/next/years", () => {
    const out = upcoming(rows, at(2026, 1, 1));
    expect(out.map((o) => o.id)).toEqual(["b", "a"]); // broken row dropped
    expect(out[0]._days).toBe(4);
    expect(out[0]._years).toBe(26);
  });
  it("drops rows with an invalid month/day", () => {
    expect(upcoming(rows, at(2026, 1, 1)).some((o) => o.id === "c")).toBe(false);
  });
});

describe("milestones (one-off countdowns)", () => {
  const trip = {
    id: "trip", title: "Disney", kind: MILESTONE_KIND,
    event_month: 3, event_day: 15, event_year: 2026,
    visibility: "everyone", countdown: 1,
  };
  const birthday = {
    id: "bday", title: "Mom", kind: "birthday",
    event_month: 1, event_day: 5, event_year: 1959,
    visibility: "everyone", countdown: 1,
  };

  it("targets the stored year instead of recurring annually", () => {
    expect(occasionTarget(trip, at(2026, 1, 1)).getFullYear()).toBe(2026);
    expect(daysUntilOccasion(trip, at(2026, 3, 3))).toBe(12);
  });
  it("does not roll a passed milestone into next year", () => {
    expect(daysUntilOccasion(trip, at(2026, 3, 16))).toBe(-1);
    expect(occasionTarget(trip, at(2027, 1, 1)).getFullYear()).toBe(2026);
  });
  it("has no target without a year", () => {
    expect(occasionTarget({ ...trip, event_year: null }, at(2026, 1, 1))).toBeNull();
    expect(daysUntilOccasion({ ...trip, event_year: null }, at(2026, 1, 1))).toBeNull();
  });
  it("still rolls non-milestone kinds to the next year", () => {
    expect(occasionTarget(birthday, at(2026, 6, 1)).getFullYear()).toBe(2027);
  });
  it("reports no age/years for a milestone", () => {
    expect(upcoming([trip], at(2026, 1, 1))[0]._years).toBeNull();
  });
  it("moves passed milestones out of upcoming and into passedMilestones", () => {
    const now = at(2026, 3, 16);
    expect(upcoming([trip, birthday], now).map((o) => o.id)).toEqual(["bday"]);
    expect(passedMilestones([trip, birthday], now).map((o) => o.id)).toEqual(["trip"]);
  });
  it("keeps a recurring occasion out of passedMilestones entirely", () => {
    expect(passedMilestones([birthday], at(2026, 6, 1))).toEqual([]);
  });
  it("identifies the kind", () => {
    expect(isMilestone(trip)).toBe(true);
    expect(isMilestone(birthday)).toBe(false);
    expect(isMilestone(null)).toBe(false);
  });
});

describe("countdownRows (what the shared surfaces show)", () => {
  const now = at(2026, 1, 1);
  const base = { kind: MILESTONE_KIND, event_month: 3, event_day: 15, event_year: 2026 };
  const rows = [
    { ...base, id: "shared", title: "Disney", visibility: "everyone", countdown: 1 },
    { ...base, id: "private", title: "Surprise", visibility: "private", countdown: 1, event_day: 10 },
    { ...base, id: "optedout", title: "Dentist", visibility: "everyone", countdown: 0, event_day: 11 },
    { ...base, id: "passed", title: "Last year", visibility: "everyone", countdown: 1, event_year: 2025 },
    { id: "bday", title: "Mom", kind: "birthday", event_month: 2, event_day: 1, event_year: 1959, visibility: "everyone", countdown: 1 },
  ];

  it("shows only opted-in, everyone-visible, not-yet-passed rows, soonest first", () => {
    expect(countdownRows(rows, now).map((o) => o.id)).toEqual(["bday", "shared"]);
  });
  it("respects the limit", () => {
    expect(countdownRows(rows, now, 1).map((o) => o.id)).toEqual(["bday"]);
  });
});

describe("contactSuggestions", () => {
  const contacts = [
    { id: "c1", name: "Aunt Sue", birthday: "1958-09-14", anniversary: "" },
    { id: "c2", name: "The Lees", birthday: "", anniversary: "2001-06-02" },
    { id: "c3", name: "No dates", birthday: "", anniversary: "" },
    { id: "c4", name: "", birthday: "1990-01-01", anniversary: "" },
  ];
  it("suggests birthdays and anniversaries that parse", () => {
    const out = contactSuggestions(contacts, []);
    expect(out.map((s) => `${s.name}:${s.kind}`)).toEqual(["Aunt Sue:birthday", "The Lees:anniversary"]);
    expect(out[0]).toMatchObject({ contactId: "c1", month: 9, day: 14, year: 1958 });
  });
  it("skips a suggestion already imported from that contact", () => {
    const existing = [{ source: "contacts", source_ref: "c1", kind: "birthday" }];
    const out = contactSuggestions(contacts, existing);
    expect(out.some((s) => s.contactId === "c1")).toBe(false);
    expect(out.some((s) => s.contactId === "c2")).toBe(true);
  });
});

describe("kindMeta", () => {
  it("resolves known kinds and falls back to Other", () => {
    expect(kindMeta("birthday").icon).toBe("🎂");
    expect(kindMeta("nonsense").label).toBe("Other");
  });
  // The label is what members read; the stored value is what the glance/agenda
  // SQL and manifest.date_reminders.one_shot_kind_values key off — renaming the
  // label must never rename the value.
  it("labels the one-off kind for humans while keeping its stored value", () => {
    expect(MILESTONE_KIND).toBe("milestone");
    expect(kindMeta(MILESTONE_KIND).label).toBe("One-time event");
  });
});

describe("searchableFields", () => {
  it("matches on the gift idea and notes, not just the title", () => {
    const fields = searchableFields({
      title: "Mia's birthday", notes: "turning 12", gift_idea: "climbing shoes", kind: "birthday",
    });
    expect(fields).toContain("climbing shoes");
    expect(fields).toContain("turning 12");
  });
});

describe("buildCalendarEvents", () => {
  const row = (over = {}) => ({
    id: "o1", member_id: "m1", kind: "birthday", title: "Mom",
    event_month: 6, event_day: 21, event_year: 1959, visibility: "everyone",
    notes: "", gift_idea: "", ...over,
  });

  it("projects a recurring occasion onto this year when it is still ahead", () => {
    const out = buildCalendarEvents([row()], "2026-06-01");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "o1", title: "Mom", description: "Birthday", location: "",
      start: "2026-06-21", end: "2026-06-21", all_day: true,
      member_ids: ["m1"], source_label: "Occasions",
    });
  });

  it("includes the occasion falling today", () => {
    expect(buildCalendarEvents([row()], "2026-06-21")[0].start).toBe("2026-06-21");
  });

  it("rolls a recurring occasion into next year once this year's has passed", () => {
    expect(buildCalendarEvents([row()], "2026-06-22")[0].start).toBe("2027-06-21");
  });

  // event_year on a recurring kind is the ORIGIN year — the age, the "Nth" —
  // and never the occurrence year. Using it as the date would export Mom's
  // birthday in 1959.
  it("ignores event_year when projecting a recurring occasion", () => {
    const out = buildCalendarEvents([row({ event_year: 1959 })], "2026-06-01");
    expect(out[0].start.slice(0, 4)).toBe("2026");
  });

  // A leap-day occasion still has to land on a real date in a non-leap year.
  // 28 February is the day the household marks it; 1 March would move it into
  // the wrong month.
  it("lands a 29 February occasion on 28 February in a non-leap year", () => {
    const out = buildCalendarEvents([row({ event_month: 2, event_day: 29 })], "2026-01-01");
    expect(out[0].start).toBe("2026-02-28");
  });

  it("keeps 29 February in a leap year", () => {
    const out = buildCalendarEvents([row({ event_month: 2, event_day: 29 })], "2028-01-01");
    expect(out[0].start).toBe("2028-02-29");
  });

  it("exports a milestone on its stored date", () => {
    const m = row({ id: "m", kind: MILESTONE_KIND, title: "Disney trip", event_year: 2026, event_month: 9, event_day: 30 });
    const out = buildCalendarEvents([m], "2026-06-01");
    expect(out[0]).toMatchObject({ start: "2026-09-30", end: "2026-09-30", description: "One-time event" });
  });

  // A milestone is one-off. Rolling a passed one forward would invent a second
  // Disney trip a year after the real one.
  it("drops a passed milestone instead of rolling it into next year", () => {
    const m = row({ kind: MILESTONE_KIND, event_year: 2026, event_month: 5, event_day: 1 });
    expect(buildCalendarEvents([m], "2026-06-01")).toEqual([]);
  });

  it("drops a milestone with no year, and a row with no usable month/day", () => {
    const noYear = row({ id: "a", kind: MILESTONE_KIND, event_year: null });
    const noDate = row({ id: "b", event_month: null, event_day: null });
    expect(buildCalendarEvents([noYear, noDate], "2026-06-01")).toEqual([]);
  });

  it("excludes rows beyond the horizon", () => {
    // A milestone is the only kind that can sit past the horizon: an annual
    // occasion always projects within a year of today.
    const far = row({ kind: MILESTONE_KIND, event_year: 2028, event_month: 1, event_day: 1 });
    expect(CALENDAR_EXPORT_HORIZON_DAYS).toBe(400);
    expect(buildCalendarEvents([far], "2026-06-01")).toEqual([]);
  });

  // THE filter. The store blob is scope-wide and the owner_or_visibility row
  // policy does not touch it, so this is the only thing keeping a private
  // occasion — usually the surprise the app exists to hold — off every member's
  // calendar and out of the household ICS feed.
  it("never exports a row whose visibility is not 'everyone'", () => {
    const rows = [
      row({ id: "pub", visibility: "everyone" }),
      row({ id: "priv", title: "Secret proposal", visibility: "private" }),
      row({ id: "blank", title: "Unset", visibility: "" }),
      row({ id: "missing", title: "Absent", visibility: undefined }),
    ];
    const out = buildCalendarEvents(rows, "2026-06-01");
    expect(out.map((e) => e.id)).toEqual(["pub"]);
    expect(JSON.stringify(out)).not.toContain("Secret proposal");
  });

  // A gift idea reaching the recipient's own shared calendar defeats the whole
  // point of writing it down; notes are free text a member wrote for the
  // household, and the ICS feed leaves the household.
  it("never exports notes or gift_idea", () => {
    const out = buildCalendarEvents([row({ notes: "turning 67", gift_idea: "climbing shoes" })], "2026-06-01");
    const json = JSON.stringify(out);
    expect(json).not.toContain("climbing shoes");
    expect(json).not.toContain("turning 67");
    expect(out[0]).not.toHaveProperty("notes");
    expect(out[0]).not.toHaveProperty("gift_idea");
  });

  it("emits an empty member_ids when the row has no member", () => {
    expect(buildCalendarEvents([row({ member_id: "" })], "2026-06-01")[0].member_ids).toEqual([]);
  });

  it("sorts ascending and caps at CALENDAR_EXPORT_MAX_EVENTS, keeping the nearest", () => {
    // 120 milestones one day apart from tomorrow, handed over in reverse order.
    const rows = [];
    for (let i = 120; i >= 1; i--) {
      const d = new Date(2026, 0, 1 + i, 12);
      rows.push(row({
        id: `x${i}`, kind: MILESTONE_KIND,
        event_year: d.getFullYear(), event_month: d.getMonth() + 1, event_day: d.getDate(),
      }));
    }
    const out = buildCalendarEvents(rows, "2026-01-01");
    expect(out).toHaveLength(CALENDAR_EXPORT_MAX_EVENTS);
    expect(out[0].start).toBe("2026-01-02");
    expect(out.map((e) => e.start)).toEqual([...out.map((e) => e.start)].sort());
    expect(out.at(-1).start).toBe("2026-04-11");
  });

  // The projection decides whether THIS year's occurrence has passed, so it has
  // to follow the household's calendar day, not the machine's.
  it("derives the projection from todayIso, not the device clock", () => {
    const before = buildCalendarEvents([row()], "2026-06-20")[0].start;
    const after = buildCalendarEvents([row()], "2026-06-22")[0].start;
    expect(before).toBe("2026-06-21");
    expect(after).toBe("2027-06-21");
  });
});
