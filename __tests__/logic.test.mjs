import { describe, it, expect } from "vitest";
import {
  parseDateParts, makeDate, daysInMonth, nextOccurrence, daysUntil,
  yearsAtNext, countdownLabel, upcoming, contactSuggestions, kindMeta,
} from "../src/logic.js";

const at = (y, m, d) => new Date(y, m - 1, d, 9, 0, 0); // a "now" fixed at 9am local

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
});
