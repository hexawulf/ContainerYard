/**
 * Parsing and validation for CY_REMOTE_HOSTS (remote cAdvisor-only hosts).
 *
 * Kept free of side effects (no env parsing at import time) so it can be unit
 * tested on its own. Error messages name the offending entry/field but never
 * echo the configured values, which may contain internal hostnames or URLs.
 */
import { z } from "zod";

export const HOST_ID_REGEX = /^[a-z0-9-]{1,32}$/;

const remoteHostEntrySchema = z.object({
  id: z.string().regex(HOST_ID_REGEX, "must match /^[a-z0-9-]{1,32}$/"),
  name: z.string().min(1, "name is required"),
  cadvisorUrl: z.string().url("cadvisorUrl must be a valid URL"),
  dozzleUrl: z.string().url("dozzleUrl must be a valid URL").optional(),
});

export type RemoteHostEnvEntry = z.infer<typeof remoteHostEntrySchema>;

/**
 * Parse `CY_REMOTE_HOSTS` (JSON array of `{id, name, cadvisorUrl, dozzleUrl?}`).
 * Empty or unset means no remote hosts. Ids must be unique, including against
 * the local host id.
 */
export function parseRemoteHostsEnv(
  raw: string | undefined,
  localHostId = "local",
): RemoteHostEnvEntry[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Invalid CY_REMOTE_HOSTS: must be a valid JSON array");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid CY_REMOTE_HOSTS: must be a JSON array");
  }

  const seenIds = new Set<string>([localHostId]);
  const entries: RemoteHostEnvEntry[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Invalid CY_REMOTE_HOSTS[${i}]: entry must be an object`);
    }
    const result = remoteHostEntrySchema.safeParse(item);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue?.path?.[0] !== undefined ? `.${String(issue.path[0])}` : "";
      // Zod's default messages for type errors don't include the received value.
      throw new Error(
        `Invalid CY_REMOTE_HOSTS[${i}]${field}: ${issue?.message ?? "validation failed"}`,
      );
    }
    if (seenIds.has(result.data.id)) {
      throw new Error(`Invalid CY_REMOTE_HOSTS[${i}].id: duplicate host id`);
    }
    seenIds.add(result.data.id);
    entries.push(result.data);
  }

  return entries;
}
