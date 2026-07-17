// An arrow-key, colored multi-select picker in the style of Claude Code's
// interactive menus. Up/Down (or k/j) move, Space toggles, A toggles all,
// Enter confirms, Esc/q/Ctrl-C cancels. Falls back to a numbered prompt when
// the terminal is not a TTY (e.g. piped input).

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  bold: "\x1b[1m",
  invert: "\x1b[7m",
};

// items: [{ label, sublabel }]. Returns an array of selected indices, or [] if
// cancelled. preselect controls whether rows start checked (default true, since
// the common case is "reopen all of these").
export async function multiSelect(items, { title = "Select sessions", preselect = true } = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return numberedFallback(items, title);
  }

  const selected = items.map(() => preselect);
  let cursor = 0;

  const { stdin, stdout } = process;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  let rendered = 0;
  const render = () => {
    if (rendered > 0) stdout.write(`\x1b[${rendered}A`); // move cursor back up
    const lines = [];
    lines.push(`${C.bold}${title}${C.reset}  ${C.dim}(Space toggle, A all, Enter confirm, Esc cancel)${C.reset}`);
    items.forEach((it, i) => {
      const isCursor = i === cursor;
      const box = selected[i] ? `${C.green}◉${C.reset}` : `${C.dim}◯${C.reset}`;
      const pointer = isCursor ? `${C.cyan}❯${C.reset}` : " ";
      const label = isCursor ? `${C.cyan}${it.label}${C.reset}` : it.label;
      const sub = it.sublabel ? `  ${C.dim}${it.sublabel}${C.reset}` : "";
      lines.push(`${pointer} ${box} ${label}${sub}`);
    });
    // Clear each line to end before writing, so shorter redraws do not leave
    // stale characters behind.
    stdout.write(lines.map((l) => `\x1b[2K${l}`).join("\n") + "\n");
    rendered = lines.length;
  };

  render();

  return new Promise((resolve) => {
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };

    const onData = (key) => {
      // Ctrl-C or Esc or q cancels.
      if (key === "\x03" || key === "\x1b" || key === "q") {
        cleanup();
        resolve([]);
        return;
      }
      // Enter confirms.
      if (key === "\r" || key === "\n") {
        cleanup();
        resolve(items.map((_, i) => i).filter((i) => selected[i]));
        return;
      }
      // Space toggles current row.
      if (key === " ") {
        selected[cursor] = !selected[cursor];
        render();
        return;
      }
      // A toggles all on/off.
      if (key === "a" || key === "A") {
        const allOn = selected.every(Boolean);
        selected.fill(!allOn);
        render();
        return;
      }
      // Arrow keys arrive as escape sequences; also accept k/j.
      if (key === "\x1b[A" || key === "k") {
        cursor = (cursor - 1 + items.length) % items.length;
        render();
        return;
      }
      if (key === "\x1b[B" || key === "j") {
        cursor = (cursor + 1) % items.length;
        render();
        return;
      }
    };

    stdin.on("data", onData);
  });
}

// Non-TTY fallback: print a numbered list and read one line of choices.
async function numberedFallback(items, title) {
  console.log(`${title}:\n`);
  items.forEach((it, i) => {
    console.log(`  [${i + 1}] ${it.label}${it.sublabel ? "  " + it.sublabel : ""}`);
  });
  console.log("\nEnter numbers to reopen (e.g. 1 3 4), 'a' for all, or Enter to cancel.");

  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("> ")).trim();
  rl.close();

  if (answer === "" || answer.toLowerCase() === "q") return [];
  if (answer.toLowerCase() === "a") return items.map((_, i) => i);

  const chosen = [];
  for (const tok of answer.split(/[\s,]+/).filter(Boolean)) {
    const n = parseInt(tok, 10);
    if (n >= 1 && n <= items.length) chosen.push(n - 1);
  }
  return [...new Set(chosen)];
}
