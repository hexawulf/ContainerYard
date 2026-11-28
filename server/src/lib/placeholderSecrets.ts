/**
 * The values shipped in .env.example are public. Startup refuses them so a
 * copied-but-unedited .env cannot boot with a known ADMIN password, session
 * secret or Redis password. Every placeholder in .env.example starts with
 * "change-me"; keep docker/entrypoint.sh in step with this check.
 */
export const PLACEHOLDER_PREFIX = "change-me";

export function isPlaceholderSecret(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().toLowerCase().startsWith(PLACEHOLDER_PREFIX);
}

/** REDIS_URL carries the Redis password in its userinfo part. */
export function redisUrlHasPlaceholderPassword(url: string | undefined | null): boolean {
  if (typeof url !== "string") return false;
  try {
    return isPlaceholderSecret(decodeURIComponent(new URL(url).password));
  } catch {
    return false;
  }
}
