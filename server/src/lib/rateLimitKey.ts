import type { Request } from "express";

/**
 * Rate-limit bucket for a client address. IPv4 (and IPv4-mapped IPv6) keys on
 * the full address. IPv6 keys on the /64 prefix: one subscriber usually holds
 * a whole /64, so keying on the full address let a single attacker rotate
 * through unlimited buckets.
 */
export function rateLimitKeyForIp(ip: string | undefined | null): string {
  if (!ip) return "unknown";
  const raw = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(raw);
  if (mapped) return mapped[1];
  if (!raw.includes(":")) return raw;

  const [head, tail = ""] = raw.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = raw.includes("::") && tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 0 || (!raw.includes("::") && headParts.length !== 8)) return raw;
  const full = [...headParts, ...Array(raw.includes("::") ? missing : 0).fill("0"), ...tailParts];
  const prefix = full.slice(0, 4).map((part) => (parseInt(part, 16) || 0).toString(16));
  return `${prefix.join(":")}::/64`;
}

export function rateLimitKey(req: Request): string {
  return rateLimitKeyForIp(req.ip);
}
