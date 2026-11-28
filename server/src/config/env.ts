import { z } from "zod";
import { HOST_ID_REGEX, parseRemoteHostsEnv, plainHttpAgentHosts } from "./remoteHosts";
import { isPlaceholderSecret, redisUrlHasPlaceholderPassword } from "../lib/placeholderSecrets";
import { checkAuthDisabledPolicy } from "../lib/authDisabled";

const PLACEHOLDER_MESSAGE = "still set to the .env.example placeholder; generate a real value";

const rawEnv = {
  ...process.env,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGIN ?? "",
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5008),
  // Interface to listen on. The container image needs 0.0.0.0 (publish the port
  // on 127.0.0.1 instead, see docker-compose.yml); bare-metal/PM2 uses 127.0.0.1.
  BIND_HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  SESSION_SECRET: z.string().min(32).refine((v) => !isPlaceholderSecret(v), PLACEHOLDER_MESSAGE),
  COOKIE_NAME: z.string().default("__Secure-cy.sid"),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("none"),
  ALLOWED_ORIGINS: z.string().min(1),
  REDIS_URL: z.string().url().refine((v) => !redisUrlHasPlaceholderPassword(v), PLACEHOLDER_MESSAGE),
  DOCKER_HOST: z.string().default("unix:///var/run/docker.sock"),
  CY_LOCAL_HOST_ID: z.string().regex(HOST_ID_REGEX).default("local"),
  CY_LOCAL_HOST_NAME: z.string().min(1).default("Local Docker"),
  CY_REMOTE_HOSTS: z.string().optional().default(""),
  ADMIN_EMAIL: z.string().email(),
  // Only needed for the first boot (seed.js creates the bootstrap ADMIN when the
  // User table is empty); remove it from the environment afterwards.
  ADMIN_PASSWORD: z.string().min(12).refine((v) => !isPlaceholderSecret(v), PLACEHOLDER_MESSAGE).optional(),
  METRICS_TOKEN: z.string().optional(),
  HOSTLOGS_LOCAL_HOST: z.string().optional(),
  HOSTLOG_NGINX_DIR: z.string().default("/var/log/nginx"),
  HOSTLOG_NGINX_ACCESS_FILE: z.string().default("access.log"),
  HOSTLOG_NGINX_ERROR_FILE: z.string().default("error.log"),
  PM2_LOG_DIR: z.string().optional(),
  PM2_APP_NAME: z.string().optional(),
  HOSTLOG_PM2_APPS: z.string().optional().default(""),
  HOSTLOG_SELF_CONTAINER: z.enum(["on", "off"]).default("on"),
  FIREBASE_ENABLED: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  FIREBASE_ALLOWED_EMAILS: z.string().optional(),
  FIREBASE_CLIENT_API_KEY: z.string().optional(),
  FIREBASE_CLIENT_AUTH_DOMAIN: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_APP_ID: z.string().optional(),
});

const parsedEnv = envSchema.parse(rawEnv);
for (const warning of checkAuthDisabledPolicy({ ...process.env, NODE_ENV: parsedEnv.NODE_ENV })) {
  console.warn(`[env] WARNING: ${warning}`);
}
export const remoteHostsConfig = parseRemoteHostsEnv(
  parsedEnv.CY_REMOTE_HOSTS,
  parsedEnv.CY_LOCAL_HOST_ID,
);

const plainHttpAgents = plainHttpAgentHosts(remoteHostsConfig);
if (plainHttpAgents.length > 0 && process.env.CY_HOSTLOG_ALLOW_HTTP !== "true") {
  console.warn(
    `[env] WARNING: PiDeck agent logs.url uses plain http for host(s) ${plainHttpAgents.join(", ")}; ` +
      "the agent bearer token is sent unencrypted. Use https:// or a private tunnel, then set CY_HOSTLOG_ALLOW_HTTP=true.",
  );
}

export const env = {
  ...parsedEnv,
  HOSTLOGS_LOCAL_HOST: parsedEnv.HOSTLOGS_LOCAL_HOST || parsedEnv.CY_LOCAL_HOST_ID,
};

export const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
