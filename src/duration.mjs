// Parse a human duration like "12h", "2d", "90m", "1w", "36" (bare number =
// hours) into milliseconds. Returns Infinity for "all"/"any", and null for
// anything it cannot parse so the caller can report a clear error.

const UNIT_MS = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export function parseDuration(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (s === "" ) return null;
  if (s === "all" || s === "any" || s === "*") return Infinity;

  // Number with an optional unit suffix. A bare number is treated as hours,
  // which is the most common "how recent" ask.
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(m|h|d|w)?$/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const unit = m[2] || "h";
  return value * UNIT_MS[unit];
}

// Render a millisecond span back into a short label for messages.
export function formatDuration(ms) {
  if (ms === Infinity) return "all time";
  if (ms % UNIT_MS.w === 0) return `${ms / UNIT_MS.w}w`;
  if (ms % UNIT_MS.d === 0) return `${ms / UNIT_MS.d}d`;
  if (ms % UNIT_MS.h === 0) return `${ms / UNIT_MS.h}h`;
  return `${Math.round(ms / UNIT_MS.m)}m`;
}
