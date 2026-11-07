/**
 * Host (non-container) log files that the Host Logs page can show.
 *
 * Files are read directly by the ContainerYard process, so only the host it
 * runs on (HOSTLOGS_LOCAL_HOST, default "piapps") has host logs. Earlier
 * versions listed the same piapps paths under piapps2 and synology too, and
 * read them by exec'ing `tail` in a "cadvisor" container that does not exist
 * on piapps, so the page never worked.
 *
 * PM2 file names include the process name and sometimes a numeric suffix
 * (containeryard-api-out-9.log), so they are resolved at request time to the
 * most recently written matching file instead of being hard-coded.
 */
import fs from "fs";
import os from "os";
import path from "path";

export const LOCAL_HOST_ID = process.env.HOSTLOGS_LOCAL_HOST ?? "piapps";

const PM2_LOG_DIR = process.env.PM2_LOG_DIR ?? path.join(os.homedir(), ".pm2", "logs");
const PM2_APP_NAME = process.env.PM2_APP_NAME ?? "containeryard-api";

type Source = string | (() => string | null);

const LOCAL_SOURCES: Record<string, Source> = {
  nginx_access: "/var/log/nginx/container.piapps.dev.access.log",
  nginx_error: "/var/log/nginx/container.piapps.dev.error.log",
  pm2_out: () => newestPm2Log("out"),
  pm2_err: () => newestPm2Log("error"),
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Most recently modified <app>-<kind>[-N].log (rotated .gz files excluded). */
export function newestPm2Log(kind: "out" | "error", dir = PM2_LOG_DIR, app = PM2_APP_NAME): string | null {
  const rx = new RegExp(`^${escapeRegex(app)}-${kind}(-\\d+)?\\.log$`);
  let best: { file: string; mtime: number } | null = null;
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (!rx.test(name)) continue;
    const file = path.join(dir, name);
    try {
      const { mtimeMs } = fs.statSync(file);
      if (!best || mtimeMs > best.mtime) best = { file, mtime: mtimeMs };
    } catch {
      // vanished between readdir and stat
    }
  }
  return best?.file ?? null;
}

/** name -> absolute file path for a host ({} for hosts without local logs). */
export function resolveHostLogs(hostId: string): Record<string, string> {
  if (hostId !== LOCAL_HOST_ID) return {};
  const out: Record<string, string> = {};
  for (const [name, source] of Object.entries(LOCAL_SOURCES)) {
    const file = typeof source === "function" ? source() : source;
    if (file) out[name] = file;
  }
  return out;
}

export function isReadable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.R_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
