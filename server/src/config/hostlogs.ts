/**
 * Host (non-container) log files that the Host Logs page can show.
 *
 * Files are read directly by the ContainerYard process, so only the host it
 * runs on (HOSTLOGS_LOCAL_HOST, default "piapps") has host logs. Earlier
 * versions listed the same piapps paths under piapps2 and synology too, and
 * read them by exec'ing `tail` in a "cadvisor" container that does not exist
 * on piapps, so the page never worked.
 *
 * All paths are configurable via environment variables so containerized
 * deployments can bind-mount host log directories read-only (e.g. /host/nginx
 * and /host/pm2) while PM2 deployments use the defaults seamlessly.
 */
import fs from "fs";
import os from "os";
import path from "path";

export const LOCAL_HOST_ID = process.env.HOSTLOGS_LOCAL_HOST ?? "piapps";

export function getNginxLogDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOSTLOG_NGINX_DIR ?? "/var/log/nginx";
}

export function getNginxAccessFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOSTLOG_NGINX_ACCESS_FILE ?? "container.piapps.dev.access.log";
}

export function getNginxErrorFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOSTLOG_NGINX_ERROR_FILE ?? "container.piapps.dev.error.log";
}

export function getPm2LogDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.PM2_LOG_DIR ?? path.join(os.homedir(), ".pm2", "logs");
}

export function getPm2AppName(env: NodeJS.ProcessEnv = process.env): string {
  return env.PM2_APP_NAME ?? "containeryard-api";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Most recently modified <app>-<kind>[-N].log (rotated .gz files excluded). */
export function newestPm2Log(
  kind: "out" | "error",
  dir = getPm2LogDir(),
  app = getPm2AppName(),
): string | null {
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
export function resolveHostLogs(
  hostId: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const localHostId = env.HOSTLOGS_LOCAL_HOST ?? LOCAL_HOST_ID;
  if (hostId !== localHostId) return {};

  const nginxDir = getNginxLogDir(env);
  const pm2Dir = getPm2LogDir(env);
  const pm2App = getPm2AppName(env);

  const sources: Record<string, string | (() => string | null)> = {
    nginx_access: path.join(nginxDir, getNginxAccessFile(env)),
    nginx_error: path.join(nginxDir, getNginxErrorFile(env)),
    pm2_out: () => newestPm2Log("out", pm2Dir, pm2App),
    pm2_err: () => newestPm2Log("error", pm2Dir, pm2App),
  };

  const out: Record<string, string> = {};
  for (const [name, source] of Object.entries(sources)) {
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
