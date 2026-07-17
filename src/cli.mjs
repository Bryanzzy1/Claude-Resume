#!/usr/bin/env node
// agent-restore: reopen recent Claude Code conversations after a reboot.
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
import { fileURLToPath } from "node:url";
import { scanSessions } from "./scan.mjs";

function parseArgs(argv) {
  const opts = { limit: 8, dryRun: false, list: false, debug: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list" || a === "-l") opts.list = true;
    else if (a === "--dry-run" || a === "-n") opts.dryRun = true;
    else if (a === "--debug") opts.debug = true;
    else if (a === "--limit") opts.limit = parseInt(argv[++i], 10) || opts.limit;
    else if (a === "--help" || a === "-h") opts.help = true;
  }
  return opts;
}

function printHelp() {
  console.log(`agent-restore - reopen recent Claude Code conversations

Usage:
  agent-restore [--limit N]     Reopen the N most recent sessions (one per dir)
  agent-restore --list          Show recent sessions, do not open anything
  agent-restore --dry-run       Print what would open, open nothing
  agent-restore --debug         Keep each tab open with a pause if resume fails
  agent-restore --limit N       Cap how many directories to restore (default 8)

Each restored session opens as a Windows Terminal tab that runs
'claude --resume <session-id>' started in that session's own directory.`);
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
export function writeWrapper(dir, index, claude, session, debug) {
  const file = join(dir, `restore-${index}.cmd`);
  const lines = [
    "@echo off",
    `cd /d "${session.cwd}"`,
    `title ${shortTitle(session.cwd)}`,
    `"${claude}" --resume ${session.sessionId}`,
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

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return printHelp();

  const sessions = scanSessions({ limit: opts.limit });

  if (sessions.length === 0) {
    console.log("No Claude sessions found under ~/.claude/projects.");
    return;
  }

  if (opts.list || opts.dryRun) {
    console.log(`Recent sessions (${sessions.length}):\n`);
    for (const s of sessions) {
      console.log(`  ${relTime(s.mtimeMs).padEnd(8)}  ${s.cwd}`);
      console.log(`            claude --resume ${s.sessionId}`);
    }
    if (opts.dryRun) console.log("\n(dry run: nothing was opened)");
    return;
  }

  const claude = resolveClaude();

  const wrapDir = join(tmpdir(), "agent-restore");
  mkdirSync(wrapDir, { recursive: true });

  const wrappers = sessions.map((s, i) => ({
    path: writeWrapper(wrapDir, i, claude, s, opts.debug),
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

// Only run as a CLI, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
