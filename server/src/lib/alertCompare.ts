/** Typed comparison used by the alert worker (kept free of DB/Docker imports so it is unit-testable). */

/** A measured value or rule threshold: a number, a container state, or nothing yet. */
export type AlertValue = number | string | null;

/**
 * `a OP b` with JavaScript's own rules for these types: two strings compare
 * as text, anything else compares as numbers (null → 0, non-numeric text → NaN
 * so the comparison is false). Kept identical to the old untyped comparison.
 */
export function relate(a: AlertValue, b: AlertValue, op: ">" | "<" | ">=" | "<="): boolean {
  if (typeof a === "string" && typeof b === "string") {
    switch (op) {
      case ">": return a > b;
      case "<": return a < b;
      case ">=": return a >= b;
      case "<=": return a <= b;
    }
  }
  const x = Number(a);
  const y = Number(b);
  switch (op) {
    case ">": return x > y;
    case "<": return x < y;
    case ">=": return x >= y;
    case "<=": return x <= y;
  }
}
