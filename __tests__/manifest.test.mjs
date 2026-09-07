import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));

const VALID_STORAGE = ["kv", "db", "none"];
const VALID_AUDIENCES = ["everyone", "adults", "children"];

describe("manifest.json", () => {
  it("has required string fields", () => {
    for (const field of ["id", "name", "version", "description", "entrypoint", "runtime", "icon"]) {
      expect(manifest[field], `missing field: ${field}`).toBeTruthy();
    }
  });

  it("entrypoint is index.html", () => expect(manifest.entrypoint).toBe("index.html"));
  it("runtime is static", () => expect(manifest.runtime).toBe("static"));
  it("storage is db", () => {
    expect(VALID_STORAGE).toContain(manifest.storage);
    expect(manifest.storage).toBe("db");
  });
  it("version follows semver", () => expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/));
  it("permissions.default_audience is valid", () => {
    expect(VALID_AUDIENCES).toContain(manifest.permissions.default_audience);
  });
  it("permissions.requires_approval is boolean", () => {
    expect(typeof manifest.permissions.requires_approval).toBe("boolean");
  });
  it("data_access has reads and writes arrays", () => {
    expect(Array.isArray(manifest.data_access.reads)).toBe(true);
    expect(Array.isArray(manifest.data_access.writes)).toBe(true);
  });

  it("reads contacts dates but writes nothing", () => {
    expect(manifest.data_access.reads).toContain("app.contacts.contact_dates");
    expect(manifest.data_access.writes).toEqual([]);
  });

  it("protects the occasions table with an owner_or_visibility policy scoped for writes", () => {
    const p = manifest.row_policies?.occasions;
    expect(p?.kind).toBe("owner_or_visibility");
    expect(p?.member_column).toBe("member_id");
    expect(p?.visibility_column).toBe("visibility");
    expect(p?.write_visibility_scoped).toBe(true);
  });

  // Member removal, in two halves — the split matters and neither whole-table
  // action is right:
  //
  // `visibility = 'everyone'` occasions are household dates that outlive
  // whoever typed them, and any member can still edit or delete them
  // (write_visibility_scoped), so they SURVIVE with a stale owner id. A blanket
  // "delete" would wipe the family's birthdays because one person left.
  //
  // `visibility = 'private'` occasions are readable by their owner alone — the
  // row policy grants no other member a path to them and there is no adult
  // bypass — so once the owner is off the roster nobody can ever see or remove
  // them again. They are deleted, and their photo reclaimed with them.
  //
  // "null" is NOT an option here whatever the semantics: member_id is TEXT NOT
  // NULL (001_init.sql), so the cleanup's raw `SET member_id = NULL` raises a
  // constraint failure that propagates out of roster removal and leaves the
  // departing member stuck mid-delete forever.
  it("deletes only the unreachable private occasions on member removal", () => {
    expect(manifest.member_references?.occasions).toEqual({
      column: "member_id",
      on_removed: "delete",
      file_id_column: "photo_file_id",
      only_when: { column: "visibility", values: ["private"] },
    });
  });

  // The hub filters cross-app calendar sources on `manifest.exports`, so
  // dropping this key does not error anywhere — it silently empties the app's
  // contribution to the household calendar and the ICS feed.
  it("declares the calendar_events export", () => {
    expect(manifest.exports).toContain("calendar_events");
  });

  // Deliberately NO store_acl on calendar_events. Do not "harden" this by
  // adding one — it would break the feature for exactly the members it exists
  // to serve.
  //
  // Occasions is member-writable by design: the row policy is
  // `owner_or_visibility` with `write_visibility_scoped`, so every member owns
  // and edits their own occasions. The store key is written by syncCalendar()
  // on the same paths. The hub only accepts `require_role: "adult"` here —
  // `validateStoreAccessRule` rejects every other value — so there is no
  // weaker role to declare, and an adult gate would mean a member's own
  // birthday never reaches the calendar until an adult happens to mutate
  // something. Worse, the POST is best-effort, so that failure is invisible.
  //
  // The tradeoff, stated plainly: with no ACL a member can POST arbitrary JSON
  // straight to the key. But the blob is rebuilt from the database on the next
  // mutation, and that same member can already create a real occasion with any
  // title that everyone sees. The marginal exposure is small next to the
  // feature the gate would break. Absence is the correct expression of "any
  // member may write this key".
  it("leaves the calendar_events store key member-writable", () => {
    expect(manifest.store_acls?.calendar_events).toBeUndefined();
  });

  it("only ever writes the two visibility values only_when relies on", () => {
    const html = readFileSync(join(__dirname, "../src/index.html"), "utf-8");
    expect(html).toMatch(/visibility:\s*isPrivate\s*\?\s*"private"\s*:\s*"everyone"/);
  });
});
