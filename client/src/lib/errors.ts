// client/src/lib/errors.ts
// Pure helper - NO React imports.

/**
 * The message of a caught value, or undefined when it has none.
 * Returns undefined (not "") so `errorMessage(e) ?? "fallback"` behaves like
 * the old untyped `e?.message ?? "fallback"`.
 */
export function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return undefined;
}
