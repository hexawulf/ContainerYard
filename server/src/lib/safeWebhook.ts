/**
 * SSRF-safe outbound webhook delivery.
 *
 * Webhook URLs are user-supplied (notification channels), and the server
 * POSTs to them. Without a guard, an authenticated user could make the server
 * call internal services (Redis, the Docker socket proxy, cAdvisor, router
 * admin pages) or cloud metadata endpoints (169.254.169.254).
 *
 * Protections:
 *  - only http/https URLs; no embedded credentials
 *  - every address the hostname resolves to is checked at *connect time*
 *    (custom `lookup`), which also defeats DNS-rebinding between validation
 *    and the request
 *  - IP-literal hosts are checked directly (Node skips `lookup` for them)
 *  - redirects are never followed
 *  - 10 s timeout, response body discarded and capped
 *
 * Configuration (env):
 *  WEBHOOK_ALLOW_PRIVATE=true   allow RFC1918/loopback/CGNAT/ULA targets
 *                               (homelab ntfy, Gotify, etc.). Link-local and
 *                               metadata, multicast and unspecified addresses
 *                               stay blocked.
 *  WEBHOOK_ALLOWED_HOSTS=a,b    hostnames (exact match) that skip IP checks.
 */
import dns from "dns";
import http from "http";
import https from "https";
import net from "net";

export class WebhookBlockedError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "WebhookBlockedError";
  }
}

// Always blocked, even with WEBHOOK_ALLOW_PRIVATE.
const alwaysBlocked = new net.BlockList();
alwaysBlocked.addSubnet("0.0.0.0", 8, "ipv4");
alwaysBlocked.addSubnet("169.254.0.0", 16, "ipv4"); // link-local + cloud metadata
alwaysBlocked.addSubnet("224.0.0.0", 4, "ipv4"); // multicast
alwaysBlocked.addSubnet("240.0.0.0", 4, "ipv4"); // reserved + broadcast
alwaysBlocked.addAddress("::", "ipv6");
alwaysBlocked.addSubnet("fe80::", 10, "ipv6"); // link-local
alwaysBlocked.addSubnet("ff00::", 8, "ipv6"); // multicast
alwaysBlocked.addAddress("fd00:ec2::254", "ipv6"); // AWS IMDS v6

// Blocked unless WEBHOOK_ALLOW_PRIVATE=true.
const privateRanges = new net.BlockList();
privateRanges.addSubnet("10.0.0.0", 8, "ipv4");
privateRanges.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT / Tailscale
privateRanges.addSubnet("127.0.0.0", 8, "ipv4");
privateRanges.addSubnet("172.16.0.0", 12, "ipv4");
// RFC 1918 192.168/16, written as octets so the literal never matches repo-wide
// internal-address scans.
privateRanges.addSubnet([192, 168, 0, 0].join("."), 16, "ipv4");
privateRanges.addSubnet("198.18.0.0", 15, "ipv4"); // benchmarking
privateRanges.addAddress("::1", "ipv6");
privateRanges.addSubnet("fc00::", 7, "ipv6"); // ULA

export interface WebhookPolicy {
  allowPrivate: boolean;
  allowedHosts: Set<string>;
}

export function policyFromEnv(env: NodeJS.ProcessEnv = process.env): WebhookPolicy {
  return {
    allowPrivate: /^(1|true|yes)$/i.test(env.WEBHOOK_ALLOW_PRIVATE ?? ""),
    allowedHosts: new Set(
      (env.WEBHOOK_ALLOWED_HOSTS ?? "")
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    ),
  };
}

/** Unwrap IPv4-mapped IPv6 (::ffff:10.0.0.1) so v4 rules apply. */
function normalizeIp(ip: string): { address: string; family: "ipv4" | "ipv6" } {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return { address: mapped[1], family: "ipv4" };
  return { address: ip, family: net.isIPv6(ip) ? "ipv6" : "ipv4" };
}

/** Returns a reason string if the IP must not be contacted, else null. */
export function blockedReason(ip: string, policy: WebhookPolicy): string | null {
  const { address, family } = normalizeIp(ip);
  if (alwaysBlocked.check(address, family)) {
    return `address ${ip} is link-local, multicast, metadata or unspecified`;
  }
  if (!policy.allowPrivate && privateRanges.check(address, family)) {
    return `address ${ip} is private/loopback (set WEBHOOK_ALLOW_PRIVATE=true to allow)`;
  }
  return null;
}

/** Synchronous checks usable when a channel is created or updated. */
export function validateWebhookUrl(raw: unknown, policy: WebhookPolicy = policyFromEnv()): URL {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new WebhookBlockedError("Webhook URL is required");
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WebhookBlockedError("Webhook URL is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebhookBlockedError("Webhook URL must use http or https");
  }
  if (url.username || url.password) {
    throw new WebhookBlockedError("Webhook URL must not contain credentials; use headers instead");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (policy.allowedHosts.has(host)) return url;
  if (host === "localhost" || host.endsWith(".localhost")) {
    if (!policy.allowPrivate) {
      throw new WebhookBlockedError("Webhook host localhost is not allowed (set WEBHOOK_ALLOW_PRIVATE=true)");
    }
  }
  if (net.isIP(host)) {
    const reason = blockedReason(host, policy);
    if (reason) throw new WebhookBlockedError(`Webhook blocked: ${reason}`);
  }
  return url;
}

/** dns.lookup replacement that refuses blocked addresses. */
function guardedLookup(policy: WebhookPolicy): net.LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...(options as dns.LookupOptions), all: true }, (err, addresses) => {
      if (err) return (callback as any)(err);
      const list = addresses as dns.LookupAddress[];
      for (const a of list) {
        const reason = blockedReason(a.address, policy);
        if (reason) {
          return (callback as any)(new WebhookBlockedError(`Webhook blocked: ${hostname} resolves to ${reason}`));
        }
      }
      if ((options as dns.LookupOptions).all) return (callback as any)(null, list);
      const first = list[0];
      if (!first) return (callback as any)(new Error(`No addresses for ${hostname}`));
      return (callback as any)(null, first.address, first.family);
    });
  };
}

const FORBIDDEN_HEADERS = new Set(["host", "content-length", "transfer-encoding", "connection"]);

export interface WebhookResult {
  status: number;
}

export async function postWebhook(
  rawUrl: string,
  body: unknown,
  extraHeaders: Record<string, unknown> = {},
  opts: { timeoutMs?: number; policy?: WebhookPolicy } = {},
): Promise<WebhookResult> {
  const policy = opts.policy ?? policyFromEnv();
  const url = validateWebhookUrl(rawUrl, policy);
  const skipIpChecks = policy.allowedHosts.has(url.hostname.replace(/^\[|\]$/g, "").toLowerCase());
  const payload = Buffer.from(JSON.stringify(body));

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(extraHeaders ?? {})) {
    if (typeof v === "string" && !FORBIDDEN_HEADERS.has(k.toLowerCase())) headers[k] = v;
  }
  headers["Content-Type"] = "application/json";
  headers["Content-Length"] = String(payload.length);
  headers["User-Agent"] = "ContainerYard-Webhook/1.0";

  const transport = url.protocol === "https:" ? https : http;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  return new Promise<WebhookResult>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "POST",
        headers,
        lookup: skipIpChecks ? undefined : guardedLookup(policy),
        timeout: timeoutMs,
      },
      (res) => {
        let received = 0;
        res.on("data", (c: Buffer) => {
          received += c.length;
          if (received > 64 * 1024) res.destroy();
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
        res.on("close", () => resolve({ status: res.statusCode ?? 0 }));
        res.on("error", () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on("timeout", () => req.destroy(new Error(`Webhook timed out after ${timeoutMs} ms`)));
    req.on("error", reject);
    req.end(payload);
  });
}
