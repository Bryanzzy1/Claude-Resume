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

That puts `agent-restore` on your PATH. (Or run it in place with
`node src/cli.mjs`.)

## Usage

```sh
agent-restore              # reopen the 8 most recent sessions, one per dir
agent-restore --limit 4    # reopen only the 4 most recent
agent-restore --list       # show recent sessions, open nothing
agent-restore --dry-run    # print what would open, open nothing
```

Run `agent-restore --list` first to see exactly what it will reopen.

## Notes

- Only the most recent conversation per directory is restored, so you never get
  duplicate tabs for the same folder.
- Paths with spaces (e.g. `Analytical Modeling With AI`) are handled correctly.
- This restores Claude Code conversations. It does not restore other terminal
  programs you had open.

## License

MIT
