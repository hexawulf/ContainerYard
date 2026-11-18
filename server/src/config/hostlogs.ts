/**
 * Host (non-container) log files that the Host Logs page can show.
 *
 * Files are read directly by the ContainerYard process, so only the local host
 * it runs on (`HOSTLOGS_LOCAL_HOST`, defaulting to `CY_LOCAL_HOST_ID` or `"local"`)
 * has host logs. Remote cAdvisor-only hosts return an empty map.
 *
 * All paths are configurable via environment variables so containerized
 * deployments can bind-mount host log directories read-only (e.g. /host/nginx
 * and /host/pm2) while bare-metal/PM2 deployments use the defaults seamlessly.
 */
import fs from "fs";
import os from "os";
import path from "path";

export const LOCAL_HOST_ID =
  process.env.HOSTLOGS_LOCAL_HOST || process.env.CY_LOCAL_HOST_ID || "local";

export function getNginxLogDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOSTLOG_NGINX_DIR ?? "/var/log/nginx";
}

export function getNginxAccessFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOSTLOG_NGINX_ACCESS_FILE ?? "access.log";
}

export function getNginxErrorFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOSTLOG_NGINX_ERROR_FILE ?? "error.log";
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
  const localHostId = env.HOSTLOGS_LOCAL_HOST || env.CY_LOCAL_HOST_ID || LOCAL_HOST_ID;
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

// ---------- async variants used on request paths (no event-loop blocking) ----------

/** Async twin of newestPm2Log: stats candidates in parallel. */
export async function newestPm2LogAsync(
  kind: "out" | "error",
  dir = getPm2LogDir(),
  app = getPm2AppName(),
): Promise<string | null> {
  const rx = new RegExp(`^${escapeRegex(app)}-${kind}(-\\d+)?\\.log$`);
  let entries: string[];
  try {
    entries = await fs.promises.readdir(dir);
  } catch {
    return null;
  }
  const stats = await Promise.all(
    entries
      .filter((name) => rx.test(name))
      .map(async (name) => {
        const file = path.join(dir, name);
        try {
          const { mtimeMs } = await fs.promises.stat(file);
          return { file, mtime: mtimeMs };
        } catch {
          return null; // vanished between readdir and stat
        }
      }),
  );
  let best: { file: string; mtime: number } | null = null;
  for (const s of stats) {
    if (s && (!best || s.mtime > best.mtime)) best = s;
  }
  return best?.file ?? null;
}

/** Async twin of resolveHostLogs. */
export async function resolveHostLogsAsync(
  hostId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, string>> {
  const localHostId = env.HOSTLOGS_LOCAL_HOST || env.CY_LOCAL_HOST_ID || LOCAL_HOST_ID;
  if (hostId !== localHostId) return {};

  const nginxDir = getNginxLogDir(env);
  const pm2Dir = getPm2LogDir(env);
  const pm2App = getPm2AppName(env);

  const [pm2Out, pm2Err] = await Promise.all([
    newestPm2LogAsync("out", pm2Dir, pm2App),
    newestPm2LogAsync("error", pm2Dir, pm2App),
  ]);

  const out: Record<string, string> = {
    nginx_access: path.join(nginxDir, getNginxAccessFile(env)),
    nginx_error: path.join(nginxDir, getNginxErrorFile(env)),
  };
  if (pm2Out) out.pm2_out = pm2Out;
  if (pm2Err) out.pm2_err = pm2Err;
  return out;
}

export async function isReadableAsync(file: string): Promise<boolean> {
  try {
    await fs.promises.access(file, fs.constants.R_OK);
    return (await fs.promises.stat(file)).isFile();
  } catch {
    return false;
  }
}
