# agent-restore

Reopen your most recent Claude Code conversations after a reboot. Each session
reopens in its own Windows Terminal tab, started in the correct directory, and
auto-resumed with `claude --resume`.

## Why

Restarting Windows kills all your terminal windows and the running agents in
them. Remembering which folders you were in and which conversation each tab held
is painful. This tool rebuilds that for you in one command.

## How it works

Claude Code already writes every conversation to disk under
`~/.claude/projects/<encoded-dir>/<session-id>.jsonl` and updates it on every
message. So your sessions are always saved, with no separate save step and
nothing to run before a restart.

`agent-restore` reads that store, picks the **most recent session per
directory** (deduped, no repeats), and reopens each as a Windows Terminal tab
running `claude --resume <session-id>` in that session's own folder.

## Requirements

- Node.js 18+
- Windows Terminal (`wt`)
- Claude Code (`claude` on PATH)

## Install

From this folder:

```sh
npm install -g .
```

That puts both `agent-restore` and the short alias `ars` on your PATH. (Or run
it in place with `node src/cli.mjs`.)

## Usage

`ars` is a short alias for `agent-restore`.

```sh
ars              # reopen sessions active in the last day
ars --pick       # show recents and choose which to reopen
ars --list       # show recent sessions, open nothing
ars --since 7    # widen the window to the last 7 days
ars --all-time   # no age cutoff
ars --limit 4    # cap how many directories to reopen (default 8)
ars --dry-run    # print what would open, open nothing
```

By default it reopens only the last day of work (per directory), so a reboot
does not resurrect stale conversations. Use `ars --list` to preview, or
`ars --pick` to choose interactively.

## Notes

- Only the most recent conversation per directory is restored, so you never get
  duplicate tabs for the same folder.
- Paths with spaces (e.g. `Analytical Modeling With AI`) are handled correctly.
- This restores Claude Code conversations. It does not restore other terminal
  programs you had open.

## License

MIT
