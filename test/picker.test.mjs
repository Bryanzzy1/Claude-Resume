// Verifies the non-TTY numbered fallback returns exactly the chosen indices,
// so selecting one session opens one (not all). The TTY arrow-key path cannot
// be driven headlessly, so we exercise the fallback that runs under piped input.
import assert from "node:assert";
import { multiSelect } from "../src/picker.mjs";

const items = [
  { label: "A", sublabel: "" },
  { label: "B", sublabel: "" },
  { label: "C", sublabel: "" },
];

// Feed a line of stdin, capture the resolved indices. The fallback reads one
// line via readline, so we push data then end.
async function choose(input) {
  const orig = { isTTY: process.stdin.isTTY };
  // Force the non-TTY path.
  Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (c) => {
    chunks.push(c);
    return true;
  };

  const p = multiSelect(items, { title: "t" });
  process.stdin.push(input + "\n");
  const result = await p;

  process.stdout.write = origWrite;
  Object.defineProperty(process.stdin, "isTTY", { value: orig.isTTY, configurable: true });
  return result;
}

const one = await choose("1");
assert.deepStrictEqual(one, [0], "selecting '1' returns only index 0");

const two = await choose("1 3");
assert.deepStrictEqual(two, [0, 2], "selecting '1 3' returns indices 0 and 2");

const all = await choose("a");
assert.deepStrictEqual(all, [0, 1, 2], "'a' returns all indices");

const none = await choose("");
assert.deepStrictEqual(none, [], "blank cancels with no selection");

console.log("OK: picker returns exactly the chosen sessions.");
process.exit(0);
