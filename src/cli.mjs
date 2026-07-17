#!/usr/bin/env node
// agent-restore: reopen recent Claude Code conversations after a reboot.
//
// Sessions are read live from ~/.claude/projects (Claude keeps them current),
// so there is nothing to save beforehand. We take the most recent session per
// directory, deduped, and either list them or reopen each in its own Windows
// Terminal tab that auto-resumes the conversation in the right folder.

import { spawnSync } from "node:child_process";
import { scanSessions } from "./scan.mjs";

function parseArgs(argv) {
  const opts = { limit: 8, dryRun: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list" || a === "-l") opts.list = true;
    else if (a === "--dry-run" || a === "-n") opts.dryRun = true;
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
  agent-restore --dry-run       Print the commands that would run, open nothing
  agent-restore --limit N       Cap how many directories to restore (default 8)

Each restored session opens as a Windows Terminal tab that runs:
  claude --resume <session-id>   started in that session's own directory.`);
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

  // Build a single `wt` command that opens all tabs at once. Windows Terminal
  // uses `;` as a tab separator, so multiple `new-tab` actions chain together.
  // Each tab: set the starting dir, then run claude resuming that session.
  const wtArgs = [];
  sessions.forEach((s, i) => {
    if (i > 0) wtArgs.push(";");
    wtArgs.push(
      "new-tab",
      "--title",
      shortTitle(s.cwd),
      "--startingDirectory",
      s.cwd,
      "cmd",
      "/k",
      `claude --resume ${s.sessionId}`
    );
  });

  console.log(`Reopening ${sessions.length} session(s) in Windows Terminal...`);
  const res = spawnSync("wt", wtArgs, { stdio: "inherit", shell: false });
  if (res.error) {
    console.error("Failed to launch Windows Terminal (wt):", res.error.message);
    console.error("Is Windows Terminal installed? Try `agent-restore --list`.");
    process.exit(1);
  }
}

function shortTitle(cwd) {
  const parts = cwd.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || cwd;
}

main();
