// Verifies wrapper and master .cmd content, especially backslash and space
// handling, which is where the earlier launch attempts failed.
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert";
import { writeWrapper, writeMaster } from "../src/cli.mjs";

const dir = join(tmpdir(), "agent-restore-test");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const claude = "C:\\Users\\bzhong\\.local\\bin\\claude.exe";
const session = {
  cwd: "C:\\Users\\bzhong\\Downloads\\Intern Project\\Analytical Modeling With AI",
  sessionId: "fb1e3d11-cd27-4cb8-bc71-53603f27bfd3",
};

// --- wrapper ---
const wrapPath = writeWrapper(dir, 0, claude, session, false);
const wrap = readFileSync(wrapPath, "utf8");
console.log("--- wrapper ---\n" + wrap);

assert.ok(wrap.includes(`cd /d "${session.cwd}"`), "cd keeps full backslash path with spaces");
assert.ok(
  wrap.includes(`"${claude}" --resume ${session.sessionId}`),
  "claude path + resume id intact with backslashes"
);
assert.ok(wrap.includes("\\Users\\bzhong"), "backslashes preserved, not stripped");
assert.ok(wrap.includes("title Analytical Modeling With AI"), "title from dir");

// --- master ---
const masterPath = writeMaster(dir, [
  { path: wrapPath, title: "Tools" },
  { path: join(dir, "restore-1.cmd"), title: "Analytical Modeling With AI" },
]);
const master = readFileSync(masterPath, "utf8");
console.log("--- master ---\n" + master);

assert.ok(master.includes('set "WT=%LOCALAPPDATA%\\Microsoft\\WindowsApps\\wt.exe"'), "resolves wt by full path");
assert.ok(master.includes('if exist "%WT%"'), "guards on wt existence");
assert.ok(master.includes("new-tab --title"), "opens wt tabs");
assert.ok(master.includes(" ; new-tab"), "second tab chained with ;");
assert.ok(master.includes('start "'), "has start fallback when wt missing");
assert.ok(master.match(/cmd \/k "[^"]+restore-0\.cmd"/), "tab runs wrapper via cmd /k");
// The wrapper paths wt sees MUST use forward slashes (wt mangles backslashes).
const wtLine = master.split(/\r?\n/).find((l) => l.includes("new-tab"));
assert.ok(!/[A-Za-z]:\\/.test(wtLine), "no backslash drive paths on the wt line");
assert.ok(wtLine.includes("/restore-0.cmd"), "wrapper path uses forward slashes");

rmSync(dir, { recursive: true, force: true });
console.log("\nOK: wrapper + master content correct (backslashes and spaces preserved).");
