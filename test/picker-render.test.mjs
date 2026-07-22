// Verifies the render helpers that keep the arrow-key menu from stacking its
// header: truncateVisible must cap the visible width (so lines never wrap to a
// second physical row) without cutting ANSI escapes.
import assert from "node:assert";
import { visibleLen, truncateVisible } from "../src/picker.mjs";

const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";

// A long colored line like the picker builds for a deep treehouse path.
const long =
  "  " +
  CYAN +
  "❯" +
  RESET +
  " Analytical Modeling With AI  2d ago  C:\\Users\\bzhong\\.treehouse\\Analytical Modeling With AI-7a2990\\1\\Analytical Modeling With AI";

assert.ok(visibleLen(long) > 80, "sample line is longer than a normal terminal");

const t = truncateVisible(long, 40);
assert.strictEqual(visibleLen(t), 40, "truncates to exactly the visible width");
assert.ok(t.endsWith(RESET), "ends with a reset so color does not bleed");

// Escapes are preserved, not split mid-sequence.
assert.ok(t.includes(CYAN), "keeps the color escape intact");
assert.ok(!/\x1b\[[0-9;]*$/.test(t), "does not end on a half-written escape");

// Short lines pass through unchanged in visible length.
const short = CYAN + "hi" + RESET;
assert.strictEqual(visibleLen(truncateVisible(short, 40)), 2, "short line unchanged");

// Zero width yields empty.
assert.strictEqual(truncateVisible(long, 0), "", "zero width is empty");

console.log("OK: render truncation caps width without breaking escapes.");
