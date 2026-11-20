import { test } from "node:test";
import assert from "node:assert/strict";
import { relate, type AlertValue } from "../../src/lib/alertCompare";

const OPS = [">", "<", ">=", "<="] as const;

/** What the old untyped `actual OP expected` returned. */
function jsCompare(a: unknown, b: unknown, op: (typeof OPS)[number]): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reference implementation of the old untyped code
  const x = a as any, y = b as any;
  switch (op) {
    case ">": return x > y;
    case "<": return x < y;
    case ">=": return x >= y;
    case "<=": return x <= y;
  }
}

test("relate() gives exactly the old JavaScript result for every operand mix", () => {
  const values: AlertValue[] = [0, 1, 5, 75.5, 90, -1, null, "", "5", "10", "abc", "running", "exited", "90"];
  for (const a of values) {
    for (const b of values) {
      for (const op of OPS) {
        assert.equal(relate(a, b, op), jsCompare(a, b, op), `${JSON.stringify(a)} ${op} ${JSON.stringify(b)}`);
      }
    }
  }
});

test("typical alert rules", () => {
  assert.equal(relate(92.5, 90, ">"), true);
  assert.equal(relate(90, 90, ">="), true);
  assert.equal(relate(3, 5, ">="), false);
  assert.equal(relate(null, 0, ">="), true); // null counts as 0, as before
  assert.equal(relate("abc", 1, ">"), false); // non-numeric text never triggers
  assert.equal(relate("10", "9", ">"), false); // two strings compare as text
});
