// Verifies the --since duration parser handles hours, days, weeks, minutes,
// bare numbers (hours), "all", and rejects garbage.
import assert from "node:assert";
import { parseDuration, formatDuration } from "../src/duration.mjs";

const M = 60 * 1000;
const H = 60 * M;
const D = 24 * H;
const W = 7 * D;

assert.strictEqual(parseDuration("12h"), 12 * H, "12h");
assert.strictEqual(parseDuration("2d"), 2 * D, "2d");
assert.strictEqual(parseDuration("90m"), 90 * M, "90m");
assert.strictEqual(parseDuration("1w"), W, "1w");
assert.strictEqual(parseDuration("36"), 36 * H, "bare number = hours");
assert.strictEqual(parseDuration("1.5d"), 1.5 * D, "fractional");
assert.strictEqual(parseDuration(" 6H "), 6 * H, "trim + case-insensitive");
assert.strictEqual(parseDuration("all"), Infinity, "all");
assert.strictEqual(parseDuration("any"), Infinity, "any");

assert.strictEqual(parseDuration(""), null, "empty is invalid");
assert.strictEqual(parseDuration("abc"), null, "garbage is invalid");
assert.strictEqual(parseDuration("5y"), null, "unsupported unit is invalid");
assert.strictEqual(parseDuration(undefined), null, "undefined is invalid");

assert.strictEqual(formatDuration(24 * H), "1d", "format 24h as 1d");
assert.strictEqual(formatDuration(12 * H), "12h", "format 12h");
assert.strictEqual(formatDuration(W), "1w", "format 1w");
assert.strictEqual(formatDuration(Infinity), "all time", "format infinity");

console.log("OK: duration parsing and formatting behave correctly.");
