#!/usr/bin/env node
// claude-resume (ars): quickly reopen your recent Claude Code sessions.
//
// Sessions are read live from ~/.claude/projects (Claude keeps them current),
// so there is nothing to save beforehand. We take the most recent session per
// directory, deduped, and reopen each in its own Windows Terminal tab that
// auto-resumes the conversation in the right folder.
//
// Launch design: Windows Terminal's `wt` command parser treats backslash as an
// escape character, so a backslash path handed to `wt ... cmd /k "C:\Users\..."`
// gets mangled (\U dropped, \b turned into a backspace: C:\Users\bzhong ->
// C:Userzhong). Windows accepts forward slashes in file paths and they have no
// escape meaning, so:
//   1. Per session, write a wrapper .cmd whose body is literal text: it `cd`s
//      into the session dir and runs `claude --resume <id>`. Backslashes inside
//      a file are just bytes, so paths there stay correct.
//   2. Write one master .cmd that runs `wt` opening a tab per wrapper, passing
//      each wrapper path with FORWARD SLASHES so wt does not mangle it.
//   3. Run the master with `cmd /c <master>` via a clean argv (shell:false).

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanSessions } from "./scan.mjs";
import { parseDuration, formatDuration } from "./duration.mjs";
import { multiSelect } from "./picker.mjs";

const DEFAULT_OPEN_MS = 24 * 60 * 60 * 1000; // bare `ars`: last 24h
const DEFAULT_BROWSE_MS = 7 * 24 * 60 * 60 * 1000; // --list: last week
const DEFAULT_OPEN_LIMIT = 8; // bare `ars` / --list
const DEFAULT_PICK_LIMIT = 10; // --pick: last 10 sessions to choose from

function parseArgs(argv) {
  const opts = {
    limit: null, // resolved after parsing, based on mode
    limitExplicit: false,
    sinceMs: null, // resolved after parsing, based on mode
    sinceExplicit: false,
    dryRun: false,
    list: false,
    pick: false,
    debug: false,
    skipPermissions: true, // resume with --dangerously-skip-permissions
    badSince: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list" || a === "-l") opts.list = true;
    else if (a === "--pick" || a === "-p") opts.pick = true;
    else if (a === "--dry-run" || a === "-n") opts.dryRun = true;
    else if (a === "--debug") opts.debug = true;
    else if (a === "--safe") opts.skipPermissions = false;
    else if (a === "--limit") {
      const n = parseInt(argv[++i], 10);
      if (n > 0) {
        opts.limit = n;
        opts.limitExplicit = true;
      }
    } else if (a === "--since") {
      const raw = argv[++i];
      const ms = parseDuration(raw);
      if (ms == null) opts.badSince = raw;
      else {
        opts.sinceMs = ms;
        opts.sinceExplicit = true;
      }
    } else if (a === "--all-time") {
      opts.sinceMs = Infinity;
      opts.sinceExplicit = true;
    } else if (a === "--help" || a === "-h") opts.help = true;
  }
  // --pick shows the last 10 sessions by last-modified with no age cutoff, so a
  // chat started long ago but touched recently still appears. --list looks back
  // a week; bare `ars` opens the last 24h. Explicit --since / --all-time /
  // --limit always win.
  if (!opts.sinceExplicit) {
    if (opts.pick) opts.sinceMs = Infinity;
    else opts.sinceMs = opts.list || opts.dryRun ? DEFAULT_BROWSE_MS : DEFAULT_OPEN_MS;
  }
  if (!opts.limitExplicit) {
    opts.limit = opts.pick ? DEFAULT_PICK_LIMIT : DEFAULT_OPEN_LIMIT;
  }
  return opts;
}

function printHelp() {
  console.log(`claude-resume (ars) - reopen recent Claude Code conversations

Usage:
  ars                 Reopen sessions active in the last 24h
  ars --pick          Arrow-key menu of your last 10 sessions to choose from
  ars --list          Show recent sessions, open nothing (last week)
  ars --since <dur>   Window like 12h, 2d, 90m, 1w (bare number = hours)
  ars --all-time      No age cutoff (every directory)
  ars --limit N       Cap how many sessions to show/restore
  ars --safe          Resume without --dangerously-skip-permissions
  ars --dry-run       Print what would open, open nothing
  ars --debug         Keep each tab open with a pause if resume fails

Bare 'ars' looks back 24h. --pick shows your last 10 sessions (any age, newest
first). --list looks back a week. --since / --all-time / --limit override.

Each restored session opens as a Windows Terminal tab that runs
'claude --resume <session-id> --dangerously-skip-permissions' in that session's
own directory. Pass --safe to drop the skip-permissions flag.`);
}

function relTime(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function shortTitle(cwd) {
  const parts = cwd.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || cwd;
}

// Resolve claude.exe's full path. We only read `where` output as text (no path
// is passed as an argument), so backslashes are preserved.
function resolveClaude() {
  const r = spawnSync("where", ["claude"], { encoding: "utf8", shell: true });
  if (r.status === 0 && r.stdout) {
    const first = r.stdout.split(/\r?\n/).find((l) => l.trim().toLowerCase().endsWith(".exe"));
    if (first) return first.trim();
  }
  return "claude"; // fall back to PATH lookup inside the tab
}

// Write a wrapper .cmd for one session. Its body is literal text: backslashes
// need no escaping inside a file. Returns the (space-free) wrapper path.
// skipPermissions adds --dangerously-skip-permissions so the resumed session
// starts without a permission prompt (on by default; --safe turns it off).
export function writeWrapper(dir, index, claude, session, debug, skipPermissions = true) {
  const file = join(dir, `restore-${index}.cmd`);
  const flags = `--resume ${session.sessionId}${skipPermissions ? " --dangerously-skip-permissions" : ""}`;
  const lines = [
    "@echo off",
    `cd /d "${session.cwd}"`,
    `title ${shortTitle(session.cwd)}`,
    `"${claude}" ${flags}`,
  ];
  if (debug) {
    lines.push(
      "if errorlevel 1 (",
      "  echo.",
      "  echo [agent-restore] claude exited with an error above. Directory / session id shown below:",
      `  echo   dir: ${session.cwd}`,
      `  echo   session: ${session.sessionId}`,
      "  pause",
      ")"
    );
  }
  writeFileSync(file, lines.join("\r\n") + "\r\n", "utf8");
  return file;
}

// Write the master .cmd that opens the tabs. `wt` is a Windows App Execution
// Alias in %LOCALAPPDATA%\Microsoft\WindowsApps, which a non-interactive cmd
// may not have on PATH, so we invoke it by full path. If Windows Terminal is
// not present, we fall back to a separate console window per session via
// `start`. Every real path is literal text here, so backslashes survive.
export function writeMaster(dir, wrappers) {
  const file = join(dir, "restore-all.cmd");

  // wt mangles backslash paths, so hand it forward-slash wrapper paths. Windows
  // accepts `/` in paths and it has no escape meaning to wt's parser.
  const fwd = (p) => p.replace(/\\/g, "/");

  // Single wt invocation opening all tabs; `;` separates tab actions.
  const wtTabs = wrappers
    .map((w, i) => {
      const nt = `new-tab --title "${w.title}" cmd /k "${fwd(w.path)}"`;
      return i === 0 ? nt : `; ${nt}`;
    })
    .join(" ");

  // Fallback: one detached console window per session (also forward-slash).
  const startLines = wrappers.map((w) => `start "${w.title}" cmd /k "${fwd(w.path)}"`);

  const body = [
    "@echo off",
    'set "WT=%LOCALAPPDATA%\\Microsoft\\WindowsApps\\wt.exe"',
    'if exist "%WT%" (',
    `  "%WT%" ${wtTabs}`,
    ") else (",
    ...startLines.map((l) => "  " + l),
    ")",
  ].join("\r\n");

  writeFileSync(file, body + "\r\n", "utf8");
  return file;
}

// Open the given sessions, one Windows Terminal tab each, auto-resumed.
function launch(sessions, debug, skipPermissions) {
  const claude = resolveClaude();
  const wrapDir = join(tmpdir(), "agent-restore");
  mkdirSync(wrapDir, { recursive: true });

  const wrappers = sessions.map((s, i) => ({
    path: writeWrapper(wrapDir, i, claude, s, debug, skipPermissions),
    title: shortTitle(s.cwd),
  }));

  const master = writeMaster(wrapDir, wrappers);

  console.log(`Reopening ${sessions.length} session(s) in Windows Terminal...`);
  // Clean argv, shell:false: nothing re-parses the master path, and the master
  // itself holds every real path as literal file text.
  const comspec = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
  const res = spawnSync(comspec, ["/c", master], { stdio: "inherit", shell: false });
  if (res.error || res.status !== 0) {
    console.error(
      "Failed to launch Windows Terminal:",
      res.error ? res.error.message : "exit code " + res.status
    );
    console.error(`You can inspect/run the generated launcher directly:\n  ${master}`);
    process.exit(1);
  }
}

// Arrow-key picker: present the sessions in a colored multi-select menu and
// return the chosen ones (possibly empty if cancelled).
async function pick(sessions) {
  const items = sessions.map((s) => ({
    label: shortTitle(s.cwd),
    sublabel: `${relTime(s.mtimeMs)}  ${s.cwd}`,
  }));
  const indices = await multiSelect(items, { title: "Reopen which sessions?" });
  return indices.map((i) => sessions[i]);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return printHelp();

  if (opts.badSince != null) {
    console.error(
      `Could not read --since "${opts.badSince}". Use forms like 12h, 2d, 90m, 1w (a bare number means hours).`
    );
    process.exit(1);
  }

  const sessions = scanSessions({ limit: opts.limit, sinceMs: opts.sinceMs });

  if (sessions.length === 0) {
    const window =
      opts.sinceMs === Infinity ? "" : ` active in the last ${formatDuration(opts.sinceMs)}`;
    console.log(`No Claude sessions found${window}. Try --since 7d or --all-time.`);
    return;
  }

  if (opts.list || opts.dryRun) {
    const perm = opts.skipPermissions ? " --dangerously-skip-permissions" : "";
    console.log(`Recent sessions (${sessions.length}):\n`);
    for (const s of sessions) {
      console.log(`  ${relTime(s.mtimeMs).padEnd(8)}  ${s.cwd}`);
      console.log(`            claude --resume ${s.sessionId}${perm}`);
    }
    if (opts.dryRun) console.log("\n(dry run: nothing was opened)");
    return;
  }

  if (opts.pick) {
    const chosen = await pick(sessions);
    if (chosen.length === 0) {
      console.log("Nothing selected.");
      return;
    }
    return launch(chosen, opts.debug, opts.skipPermissions);
  }

  launch(sessions, opts.debug, opts.skipPermissions);
}

// Run as a CLI unless imported by a test. A full-path compare of
// import.meta.url against process.argv[1] is unreliable: `npm install -g .`
// symlinks the global package back to this source, so the two paths differ and
// main() would silently never run. Instead we detect by entry-file basename:
// when node is launched with cli.mjs as the entry (directly or via the npm
// shim), run; when a test imports this module, its own file is the entry, so
// we skip. AGENT_RESTORE_NO_MAIN lets a test force-skip if ever needed.
function isMain() {
  if (process.env.AGENT_RESTORE_NO_MAIN) return false;
  const entry = process.argv[1];
  if (!entry) return false;
  return /(^|[\\/])cli\.mjs$/i.test(entry);
}

if (isMain()) {
  main().catch((e) => {
    console.error("claude-resume error:", e.message);
    process.exit(1);
  });
}
