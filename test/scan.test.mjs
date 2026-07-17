// Verifies scanSessions dedups per directory, sorts newest-first, and applies
// the sinceDays age cutoff. Uses a fake ~/.claude/projects under a temp HOME.
import { mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert";

const fakeHome = join(tmpdir(), "ar-scan-home");
rmSync(fakeHome, { recursive: true, force: true });
process.env.USERPROFILE = fakeHome;
process.env.HOME = fakeHome;

const projects = join(fakeHome, ".claude", "projects");

// One project dir with two sessions (should dedup to the newer one), plus an
// old project dir that the 3-day window should drop.
function makeSession(projName, sessionId, cwd, ageDays) {
  const dir = join(projects, projName);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, sessionId + ".jsonl");
  writeFileSync(file, JSON.stringify({ type: "x", cwd }) + "\n", "utf8");
  const when = new Date(Date.now() - ageDays * 86400000);
  utimesSync(file, when, when);
}

makeSession("projA", "new-session", "C:\\work\\A", 0.1);
makeSession("projA", "old-session", "C:\\work\\A", 1); // same dir, older
makeSession("projB", "recent-b", "C:\\work\\B", 2);
makeSession("projC", "stale-c", "C:\\work\\C", 10); // outside 3-day window

const { scanSessions } = await import("../src/scan.mjs");

const DAY = 24 * 60 * 60 * 1000;
const recent = scanSessions({ sinceMs: 3 * DAY });
const cwds = recent.map((s) => s.cwd);
console.log("within 3 days:", cwds);

assert.strictEqual(recent.length, 2, "only A and B are within 3 days");
assert.deepStrictEqual(cwds, ["C:\\work\\A", "C:\\work\\B"], "sorted newest-first, C dropped");
assert.strictEqual(recent[0].sessionId, "new-session", "dedup keeps the newest session per dir");

const all = scanSessions({ sinceMs: Infinity });
assert.strictEqual(all.length, 3, "all-time includes the stale dir");

rmSync(fakeHome, { recursive: true, force: true });
console.log("\nOK: dedup, sort, and 3-day cutoff behave correctly.");
