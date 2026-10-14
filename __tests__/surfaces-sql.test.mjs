/**
 * The glance and agenda queries run as SQL on the hub, with `:today` bound to
 * the household's calendar day, so the leap-day rule the page's JS follows
 * (29 February is marked on 28 February in a non-leap year — makeDate clamps,
 * see logic.test.mjs) has to hold in the SQL too, or the glance names a date
 * that does not exist and Today skips the birthday.
 *
 * Run here against node's SQLite, which has the same date(), strftime() and
 * printf() D1 does. `:today` is spliced in as a literal: the hub binds it as a
 * parameter, and a bound string and a literal string evaluate identically.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));

const ROWS = [
  // title, kind, month, day, year
  ["Leap", "birthday", 2, 29, 1992],
  ["Feb 28", "birthday", 2, 28, null],
  ["Thirty-first", "other", 4, 31, null],
  ["June", "birthday", 6, 21, 1959],
  ["Trip", "milestone", 2, 29, 2028],
  ["Secret", "birthday", 1, 1, null, "private"],
];

let db;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE app_occasions__occasions (
    id TEXT PRIMARY KEY, title TEXT, emoji TEXT DEFAULT '', member_id TEXT DEFAULT 'm1', kind TEXT,
    event_month INTEGER, event_day INTEGER, event_year INTEGER, countdown INTEGER DEFAULT 1,
    visibility TEXT DEFAULT 'everyone'
  )`);
  const insert = db.prepare(
    "INSERT INTO app_occasions__occasions (id, title, kind, event_month, event_day, event_year, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  ROWS.forEach(([title, kind, month, day, year, visibility], i) =>
    insert.run(`r${i}`, title, kind, month, day, year, visibility ?? "everyone"));
});

/** Runs a manifest query as the hub would for one household day. */
function run(query, today, { limit } = {}) {
  let sql = query.replaceAll(":today", `'${today}'`);
  if (limit) sql = sql.replace(/LIMIT \d+$/, `LIMIT ${limit}`);
  return db.prepare(sql).all();
}

describe("glance query (next occurrence of each countdown)", () => {
  const glance = manifest.glance.source.query;
  const at = (today) => Object.fromEntries(run(glance, today, { limit: 10 }).map((r) => [r.title, r.at]));

  it("lands a 29 February birthday on 28 February in a non-leap year", () => {
    expect(at("2026-10-13").Leap).toBe("2027-02-28");
    expect(at("2027-02-28").Leap).toBe("2027-02-28"); // still today, not rolled past
  });

  it("keeps 29 February in a leap year", () => {
    expect(at("2027-03-01").Leap).toBe("2028-02-29");
    expect(at("2028-02-29").Leap).toBe("2028-02-29");
  });

  it("clamps a day past the month's end the same way", () => {
    expect(at("2026-04-01")["Thirty-first"]).toBe("2026-04-30");
    expect(at("2026-04-30")["Thirty-first"]).toBe("2026-04-30");
    expect(at("2026-05-01")["Thirty-first"]).toBe("2027-04-30");
  });

  it("rolls an ordinary birthday into next year only once it has passed", () => {
    expect(at("2026-06-21").June).toBe("2026-06-21");
    expect(at("2026-06-22").June).toBe("2027-06-21");
    expect(at("2026-12-31").June).toBe("2027-06-21");
  });

  it("dates a milestone by its own year and never a private occasion at all", () => {
    const rows = at("2026-10-13");
    expect(rows.Trip).toBe("2028-02-29");
    expect(rows.Secret).toBeUndefined();
  });

  it("orders by the projected date and honours the LIMIT", () => {
    expect(run(glance, "2026-10-13").map((r) => r.title)).toEqual(["Leap", "Feb 28", "Thirty-first"]);
  });
});

describe("agenda query (occasions falling today)", () => {
  const agenda = manifest.agenda.source.query;
  const titles = (today) => run(agenda, today).map((r) => r.title).sort();

  it("shows a 29 February birthday on 28 February of a non-leap year, beside the 28th's own", () => {
    expect(titles("2027-02-28")).toEqual(["Feb 28", "Leap"]);
  });

  it("shows it on 29 February in a leap year and not on the 28th", () => {
    expect(titles("2028-02-28")).toEqual(["Feb 28"]);
    expect(titles("2028-02-29")).toEqual(["Leap", "Trip"]);
  });

  it("never shows it on 1 March", () => {
    expect(titles("2027-03-01")).toEqual([]);
  });

  it("shows a milestone only in its own year", () => {
    expect(titles("2027-02-28")).not.toContain("Trip");
  });
});
