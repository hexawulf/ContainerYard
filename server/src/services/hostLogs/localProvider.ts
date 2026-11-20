/**
 * Local host log provider: nginx access/error files, configured PM2 apps,
 * optional legacy PM2_APP_NAME, and ContainerYard's own Docker container
 * (`cy_app`, discovered from os.hostname() via the shared Docker client).
 */
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { HostConfig } from "../../config/hosts";
import { CONTAINER_REF, dockerClient, getContainerLogs } from "../docker";
import {
  HostLogSourceError,
  type HostLogListResult,
  type HostLogProvider,
  type HostLogSource,
  type HostLogTailOptions,
  type HostLogTailResult,
  type LocalDockerTarget,
} from "./types";

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

/** Explicit legacy PM2_APP_NAME only (empty by default so stale sources disappear). */
export function getPm2AppName(env: NodeJS.ProcessEnv = process.env): string | null {
  const name = env.PM2_APP_NAME?.trim();
  return name ? name : null;
}

/** Comma-separated PM2 app names from HOSTLOG_PM2_APPS. */
export function parsePm2Apps(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.HOSTLOG_PM2_APPS ?? "";
  const seen = new Set<string>();
  const apps: string[] = [];
  for (const part of raw.split(",")) {
    const app = part.trim();
    if (!app || seen.has(app)) continue;
    seen.add(app);
    apps.push(app);
  }
  return apps;
}

export function pm2AppSourceSlug(app: string): string {
  return app
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function isSelfContainerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const val = (env.HOSTLOG_SELF_CONTAINER ?? "on").trim().toLowerCase();
  return val !== "off" && val !== "0" && val !== "false";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Most recently modified <app>-<kind>[-N].log (rotated .gz files excluded). */
export function newestPm2Log(
  kind: "out" | "error",
  dir = getPm2LogDir(),
  app: string | null = getPm2AppName(),
): string | null {
  if (!app) return null;
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

/** Async twin of newestPm2Log: stats candidates in parallel. */
export async function newestPm2LogAsync(
  kind: "out" | "error",
  dir = getPm2LogDir(),
  app: string | null = getPm2AppName(),
): Promise<string | null> {
  if (!app) return null;
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

/** name -> absolute file path for a host ({} for hosts without local logs). */
export function resolveHostLogs(
  hostId: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const localHostId = env.HOSTLOGS_LOCAL_HOST || env.CY_LOCAL_HOST_ID || LOCAL_HOST_ID;
  if (hostId !== localHostId) return {};

  const nginxDir = getNginxLogDir(env);
  const pm2Dir = getPm2LogDir(env);
  const legacyPm2App = getPm2AppName(env);
  const pm2Apps = parsePm2Apps(env);

  const out: Record<string, string> = {
    nginx_access: path.join(nginxDir, getNginxAccessFile(env)),
    nginx_error: path.join(nginxDir, getNginxErrorFile(env)),
  };

  for (const app of pm2Apps) {
    const slug = pm2AppSourceSlug(app);
    if (!slug) continue;
    const outFile = newestPm2Log("out", pm2Dir, app);
    const errFile = newestPm2Log("error", pm2Dir, app);
    if (outFile) out[`pm2_${slug}_out`] = outFile;
    if (errFile) out[`pm2_${slug}_err`] = errFile;
  }

  if (legacyPm2App) {
    const outFile = newestPm2Log("out", pm2Dir, legacyPm2App);
    const errFile = newestPm2Log("error", pm2Dir, legacyPm2App);
    if (outFile) out.pm2_out = outFile;
    if (errFile) out.pm2_err = errFile;
  }

  return out;
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
  const legacyPm2App = getPm2AppName(env);
  const pm2Apps = parsePm2Apps(env);

  const out: Record<string, string> = {
    nginx_access: path.join(nginxDir, getNginxAccessFile(env)),
    nginx_error: path.join(nginxDir, getNginxErrorFile(env)),
  };

  const appResults = await Promise.all(
    pm2Apps.map(async (app) => {
      const slug = pm2AppSourceSlug(app);
      if (!slug) return null;
      const [outFile, errFile] = await Promise.all([
        newestPm2LogAsync("out", pm2Dir, app),
        newestPm2LogAsync("error", pm2Dir, app),
      ]);
      return { slug, outFile, errFile };
    }),
  );
  for (const item of appResults) {
    if (!item) continue;
    if (item.outFile) out[`pm2_${item.slug}_out`] = item.outFile;
    if (item.errFile) out[`pm2_${item.slug}_err`] = item.errFile;
  }

  if (legacyPm2App) {
    const [pm2Out, pm2Err] = await Promise.all([
      newestPm2LogAsync("out", pm2Dir, legacyPm2App),
      newestPm2LogAsync("error", pm2Dir, legacyPm2App),
    ]);
    if (pm2Out) out.pm2_out = pm2Out;
    if (pm2Err) out.pm2_err = pm2Err;
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

export async function isReadableAsync(file: string): Promise<boolean> {
  try {
    await fs.promises.access(file, fs.constants.R_OK);
    return (await fs.promises.stat(file)).isFile();
  } catch {
    return false;
  }
}

async function fileMeta(file: string): Promise<{ readable: boolean; size?: number; mtime?: string; hint?: string }> {
  try {
    await fs.promises.access(file, fs.constants.R_OK);
    const st = await fs.promises.stat(file);
    if (!st.isFile()) return { readable: false, hint: "Not a regular file." };
    return { readable: true, size: st.size, mtime: st.mtime.toISOString() };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      return { readable: false, hint: "Permission denied." };
    }
    return { readable: false, hint: "File not found." };
  }
}

function grepFilter(pattern: string | undefined): (line: string) => boolean {
  if (!pattern) return () => true;
  const lower = pattern.toLowerCase();
  return (line) => line.toLowerCase().includes(lower);
}

export interface LocalProviderOptions {
  hostId: string;
  env?: NodeJS.ProcessEnv;
  dockerSocketPath?: string;
  hostname?: () => string;
}

export function createLocalHostLogProvider(opts: LocalProviderOptions): HostLogProvider {
  const getEnv = () => opts.env ?? process.env;
  const getSocketPath = () => {
    if (opts.dockerSocketPath) return opts.dockerSocketPath;
    const raw = getEnv().DOCKER_HOST ?? "unix:///var/run/docker.sock";
    return raw.replace(/^unix:\/\//, "") || "/var/run/docker.sock";
  };
  const getHostname = () => (opts.hostname ? opts.hostname() : os.hostname());

  const localHostConfig = (): HostConfig => ({
    id: opts.hostId,
    name: opts.hostId,
    provider: "DOCKER",
    nodeLabel: opts.hostId,
    docker: { socketPath: getSocketPath() },
  });

  async function inspectSelfContainer(): Promise<{ id: string; startedAt?: string } | null> {
    if (!isSelfContainerEnabled(getEnv())) return null;
    const ref = getHostname().trim();
    if (!ref || !CONTAINER_REF.test(ref)) return null;
    try {
      const info = await dockerClient(getSocketPath()).getContainer(ref).inspect();
      return { id: info.Id || ref, startedAt: info.State?.StartedAt };
    } catch {
      return null;
    }
  }

  async function resolveNamedLocalFiles(): Promise<
    Map<string, { title: string; kind: "file" | "pm2"; filePath: string | null }>
  > {
    const env = getEnv();
    const nginxDir = getNginxLogDir(env);
    const pm2Dir = getPm2LogDir(env);
    const pm2Apps = parsePm2Apps(env);
    const legacyPm2App = getPm2AppName(env);

    const map = new Map<string, { title: string; kind: "file" | "pm2"; filePath: string | null }>();
    map.set("nginx_access", {
      title: "Nginx Access Log",
      kind: "file",
      filePath: path.join(nginxDir, getNginxAccessFile(env)),
    });
    map.set("nginx_error", {
      title: "Nginx Error Log",
      kind: "file",
      filePath: path.join(nginxDir, getNginxErrorFile(env)),
    });

    const appFiles = await Promise.all(
      pm2Apps.map(async (app) => {
        const slug = pm2AppSourceSlug(app);
        if (!slug) return null;
        const [outFile, errFile] = await Promise.all([
          newestPm2LogAsync("out", pm2Dir, app),
          newestPm2LogAsync("error", pm2Dir, app),
        ]);
        return { app, slug, outFile, errFile };
      }),
    );

    for (const item of appFiles) {
      if (!item) continue;
      map.set(`pm2_${item.slug}_out`, {
        title: `PM2: ${item.app} (stdout)`,
        kind: "pm2",
        filePath: item.outFile,
      });
      map.set(`pm2_${item.slug}_err`, {
        title: `PM2: ${item.app} (stderr)`,
        kind: "pm2",
        filePath: item.errFile,
      });
    }

    if (legacyPm2App) {
      const [outFile, errFile] = await Promise.all([
        newestPm2LogAsync("out", pm2Dir, legacyPm2App),
        newestPm2LogAsync("error", pm2Dir, legacyPm2App),
      ]);
      if (outFile) {
        map.set("pm2_out", { title: "PM2 Output", kind: "pm2", filePath: outFile });
      }
      if (errFile) {
        map.set("pm2_err", { title: "PM2 Errors", kind: "pm2", filePath: errFile });
      }
    }

    return map;
  }

  return {
    type: "local",

    async list(): Promise<HostLogListResult> {
      const [fileMap, selfContainer] = await Promise.all([
        resolveNamedLocalFiles(),
        inspectSelfContainer(),
      ]);

      const sources: HostLogSource[] = await Promise.all(
        Array.from(fileMap.entries()).map(async ([name, spec]): Promise<HostLogSource> => {
          if (!spec.filePath) {
            return {
              name,
              title: spec.title,
              kind: spec.kind,
              available: false,
              hint: "No matching log file yet.",
            };
          }
          const meta = await fileMeta(spec.filePath);
          return {
            name,
            title: spec.title,
            kind: spec.kind,
            available: meta.readable,
            path: spec.filePath,
            ...(meta.hint ? { hint: meta.hint } : {}),
            ...(meta.size !== undefined ? { size: meta.size } : {}),
            ...(meta.mtime ? { mtime: meta.mtime } : {}),
          };
        }),
      );

      if (selfContainer) {
        sources.push({
          name: "cy_app",
          title: "ContainerYard App",
          kind: "docker",
          available: true,
          ...(selfContainer.startedAt ? { mtime: selfContainer.startedAt } : {}),
        });
      }

      return { sources };
    },

    async tail(name: string, options: HostLogTailOptions): Promise<HostLogTailResult> {
      if (name === "cy_app") {
        const self = await inspectSelfContainer();
        if (!self) {
          throw new HostLogSourceError(404, "not_found", `Unknown log name: ${name} for host ${opts.hostId}.`);
        }
        const raw = await getContainerLogs(localHostConfig(), self.id, {
          tail: options.lines,
          grep: options.grep,
          stdout: true,
          stderr: true,
        });
        const lines = raw.split("\n").filter((l) => l.length > 0);
        return { lines };
      }

      const fileMap = await resolveNamedLocalFiles();
      const spec = fileMap.get(name);
      if (!spec) {
        throw new HostLogSourceError(404, "not_found", `Unknown log name: ${name} for host ${opts.hostId}.`);
      }
      if (!spec.filePath || !(await isReadableAsync(spec.filePath))) {
        throw new HostLogSourceError(
          200,
          "not_readable",
          `Log file is missing or not readable${spec.filePath ? `: ${spec.filePath}` : ""}`,
        );
      }

      const keep = grepFilter(options.grep);
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
          "tail",
          ["-n", String(options.lines), "--", spec.filePath!],
          { maxBuffer: 32 * 1024 * 1024, timeout: 15_000, encoding: "utf8" },
          (error, out) => {
            if (error) {
              reject(new HostLogSourceError(200, "read_error", error.message));
              return;
            }
            resolve(out);
          },
        );
      });

      const lines = stdout.split("\n").filter((l) => l.length > 0 && keep(l));
      return { lines };
    },

    async resolveLocalFile(name: string): Promise<string | null> {
      if (name === "cy_app") return null;
      const fileMap = await resolveNamedLocalFiles();
      return fileMap.get(name)?.filePath ?? null;
    },

    async resolveLocalDockerContainer(name: string): Promise<LocalDockerTarget | null> {
      if (name !== "cy_app") return null;
      const self = await inspectSelfContainer();
      if (!self) return null;
      return { socketPath: getSocketPath(), containerId: self.id };
    },
  };
}
