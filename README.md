<h1 align="center">claude-resume</h1>

<p align="center">
  <a href="#"><img alt="Platform" src="https://img.shields.io/badge/platform-Windows-blue?style=flat-square" /></a>
  <a href="#"><img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-green?style=flat-square" /></a>
  <a href="#"><img alt="License" src="https://img.shields.io/badge/license-MIT-black?style=flat-square" /></a>
</p>

<h3 align="center">Jump back into your recent Claude Code sessions.</h3>

Picking up where you left off means remembering which folders you were in and which conversation each tab held. After closing tabs, switching machines, or a reboot, that context is gone.

`claude-resume` (command `ars`) brings it back in one command. It reads the sessions Claude Code already keeps on disk, and reopens each recent one as a Windows Terminal tab, started in the right folder and auto-resumed.

- **Nothing to save.** Claude writes every conversation to disk on each message, so there is no capture step and nothing to miss.
- **Right folder, right chat.** Each tab opens in the session's own directory and runs `claude --resume` for that exact conversation.
- **Recent only.** By default it reopens the last 24 hours of work, one conversation per directory, so you do not resurrect stale chats.
- **Pick when you want.** An arrow-key menu lets you choose which sessions to reopen.

## Quick Start

```sh
$ ars                          # reopen sessions active in the last 24h
Reopening 3 session(s) in Windows Terminal...
```

```sh
$ ars --pick                   # choose which to reopen from a menu
$ ars --since 12h              # widen or narrow the window (12h, 2d, 90m, 1w)
$ ars --list                   # preview recents, open nothing
```

## Install

Requires Node.js 18+, Windows Terminal (`wt`), and Claude Code (`claude` on PATH).

From this folder:

```sh
npm install -g .
```

That puts both `claude-resume` and the short alias `ars` on your PATH. (Or run it in place with `node src/cli.mjs`.)

If PowerShell blocks the command with an execution-policy error, allow local scripts once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## Usage

```sh
ars              # reopen sessions active in the last 24h
ars --pick       # arrow-key menu of your last 10 sessions to choose from
ars --list       # show recent sessions, open nothing (last week)
ars --since 12h  # window as 12h, 2d, 90m, 1w (a bare number means hours)
ars --all-time   # no age cutoff
ars --limit 4    # cap how many sessions to show/reopen
ars --dry-run    # print what would open, open nothing
ars --debug      # keep each tab open with a pause if resume fails
```

Bare `ars` looks back 24 hours. `--pick` shows your last 10 sessions regardless of age (newest first by last activity), so a chat you started long ago but talked to recently still appears. `--list` looks back a week. An explicit `--since`, `--all-time`, or `--limit` overrides these defaults.

In the `--pick` menu: Up/Down move, Space selects a session, A selects all, Enter opens the selected ones (or just the highlighted row if none are checked), Esc cancels.

## How it works

Claude Code writes every conversation to `~/.claude/projects/<encoded-dir>/<session-id>.jsonl` and appends to it on every message. Each file records its own working directory, and the filename is the session id.

`claude-resume` is a reader. It scans that store, picks the most recent session per directory within your time window, then for each one writes a small wrapper `.cmd` that runs `claude --resume <id>` in the session's folder, and opens them as Windows Terminal tabs.

Sessions whose directory no longer exists are skipped, so a deleted project or a recycled worktree never reopens a dead folder.

Wrapper files hold real paths as literal text and `wt` is handed forward-slash paths, which sidesteps the backslash mangling that breaks a naive `wt ... cmd /k "C:\..."` launch.

## License

MIT
