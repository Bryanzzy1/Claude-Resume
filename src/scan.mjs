// Scans Claude Code's on-disk session store and returns the most recent
// session per working directory. Claude writes every conversation to
// ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl and updates it on each
// message, so this data is always current with no separate save step.

import { readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

// Read the real cwd recorded inside a session file. Every event line carries a
// "cwd" field. We scan a bounded number of lines because the first line can be
// a "mode" record that has no cwd.
function readCwd(file) {
  let fd;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(64 * 1024);
    const bytes = readSync(fd, buf, 0, buf.length, 0);
    const text = buf.toString("utf8", 0, bytes);
    const m = text.match(/"cwd":"((?:[^"\\]|\\.)*)"/);
    if (!m) return null;
    // The value is JSON-escaped (backslashes doubled); decode it.
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// True if path exists and is a directory. Used to skip sessions whose folder is
// gone (deleted projects, recycled treehouse worktrees), so we never try to
// reopen a tab in a directory that no longer exists.
function dirExists(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Return one entry per directory: the most recently modified session in it.
// Sorted newest-first. limit caps how many directories come back. sinceMs drops
// sessions whose most recent activity is older than that many milliseconds (so
// a reboot only reopens work you were actually in recently), pass 0/Infinity to
// keep all ages. requireDir (default true) drops sessions whose recorded
// working directory no longer exists on disk.
export function scanSessions({ limit = Infinity, sinceMs = Infinity, requireDir = true } = {}) {
  const cutoffMs = sinceMs === Infinity || !sinceMs ? 0 : Date.now() - sinceMs;
  let projectDirs;
  try {
    projectDirs = readdirSync(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const byCwd = new Map();

  for (const dirent of projectDirs) {
    if (!dirent.isDirectory()) continue;
    const dir = join(PROJECTS_DIR, dirent.name);

    let files;
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }

    for (const file of files) {
      const full = join(dir, file);
      let mtimeMs;
      try {
        mtimeMs = statSync(full).mtimeMs;
      } catch {
        continue;
      }
      const sessionId = file.slice(0, -".jsonl".length);
      const cwd = readCwd(full);
      if (!cwd) continue;

      const key = cwd.toLowerCase();
      const existing = byCwd.get(key);
      if (!existing || mtimeMs > existing.mtimeMs) {
        byCwd.set(key, { cwd, sessionId, mtimeMs });
      }
    }
  }

  return [...byCwd.values()]
    .filter((s) => s.mtimeMs >= cutoffMs)
    .filter((s) => !requireDir || dirExists(s.cwd))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);
}
