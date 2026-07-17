// Verifies scanSessions dedups per directory, sorts newest-first, applies the
// age cutoff, and can drop sessions whose directory no longer exists. Uses a
// fake ~/.claude/projects under a temp HOME.
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
// The fake cwds (C:\work\A, etc.) do not exist on disk, so disable the
// directory check for the dedup/sort/age assertions.
const recent = scanSessions({ sinceMs: 3 * DAY, requireDir: false });
const cwds = recent.map((s) => s.cwd);
console.log("within 3 days:", cwds);

assert.strictEqual(recent.length, 2, "only A and B are within 3 days");
assert.deepStrictEqual(cwds, ["C:\\work\\A", "C:\\work\\B"], "sorted newest-first, C dropped");
assert.strictEqual(recent[0].sessionId, "new-session", "dedup keeps the newest session per dir");

const all = scanSessions({ sinceMs: Infinity, requireDir: false });
assert.strictEqual(all.length, 3, "all-time includes the stale dir");

// requireDir (default) drops sessions whose directory is gone. Make one session
// point at a real temp dir and another at a deleted one.
const realDir = join(tmpdir(), "ar-scan-real");
const goneDir = join(tmpdir(), "ar-scan-gone");
mkdirSync(realDir, { recursive: true });
rmSync(goneDir, { recursive: true, force: true }); // ensure it does not exist
makeSession("projReal", "real-sess", realDir, 0.05);
makeSession("projGone", "gone-sess", goneDir, 0.05);

const live = scanSessions({ sinceMs: Infinity });
const liveCwds = live.map((s) => s.cwd);
console.log("with requireDir:", liveCwds);
assert.ok(liveCwds.includes(realDir), "keeps session whose dir exists");
assert.ok(!liveCwds.includes(goneDir), "drops session whose dir is gone");

rmSync(realDir, { recursive: true, force: true });
rmSync(fakeHome, { recursive: true, force: true });
console.log("\nOK: dedup, sort, age cutoff, and missing-dir filter behave correctly.");
