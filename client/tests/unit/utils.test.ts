import { test } from "node:test";
import assert from "node:assert/strict";
import { cn, ensureArray, formatRelativeTime } from "../../src/lib/utils";
import { errorMessage } from "../../src/lib/errors";

const ago = (sec: number) => new Date(Date.now() - sec * 1000);

test("formatRelativeTime covers every range", () => {
  const cases: Array<[number, string]> = [
    [10, "less than a minute ago"],
    [60, "1 minute ago"],
    [30 * 60, "30 minutes ago"],
    [60 * 60, "about 1 hour ago"],
    [5 * 3600, "about 5 hours ago"],
    [30 * 3600, "1 day ago"],
    [5 * 86400, "5 days ago"],
    [40 * 86400, "about 1 month ago"],
    [100 * 86400, "3 months ago"],
    [400 * 86400, "about 1 year ago"],
    [800 * 86400, "2 years ago"],
  ];
  for (const [sec, want] of cases) assert.equal(formatRelativeTime(ago(sec)), want, `${sec}s`);
});

test("formatRelativeTime: future, no suffix, string/number input, invalid", () => {
  assert.equal(formatRelativeTime(ago(-5 * 60)), "in 5 minutes");
  assert.equal(formatRelativeTime(ago(5 * 60), false), "5 minutes");
  assert.equal(formatRelativeTime(ago(120).toISOString()), "2 minutes ago");
  assert.equal(formatRelativeTime(ago(120).getTime()), "2 minutes ago");
  assert.equal(formatRelativeTime("not a date"), "unknown");
});

test("cn merges Tailwind classes (last one wins) and drops falsy values", () => {
  assert.equal(cn("p-2 text-sm", false, undefined, "p-4"), "text-sm p-4");
});

test("ensureArray only passes arrays through", () => {
  assert.deepEqual(ensureArray([1, 2]), [1, 2]);
  for (const v of [null, undefined, {}, "abc", 3]) assert.deepEqual(ensureArray(v), []);
});

test("errorMessage: Error, message-like objects, and undefined otherwise", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(errorMessage({ message: "plain" }), "plain");
  assert.equal(errorMessage({ message: 1 }), undefined);
  assert.equal(errorMessage("text"), undefined);
  assert.equal(errorMessage(null) ?? "fallback", "fallback");
});
