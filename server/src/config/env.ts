import { z } from "zod";
import { HOST_ID_REGEX, parseRemoteHostsEnv } from "./remoteHosts";

const rawEnv = {
  ...process.env,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGIN ?? "",
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5008),
  LOG_LEVEL: z.string().default("info"),
  SESSION_SECRET: z.string().min(32),
  COOKIE_NAME: z.string().default("__Secure-cy.sid"),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("none"),
  ALLOWED_ORIGINS: z.string().min(1),
  REDIS_URL: z.string().url(),
  DOCKER_HOST: z.string().default("unix:///var/run/docker.sock"),
  CY_LOCAL_HOST_ID: z.string().regex(HOST_ID_REGEX).default("local"),
  CY_LOCAL_HOST_NAME: z.string().min(1).default("Local Docker"),
  CY_REMOTE_HOSTS: z.string().optional().default(""),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12),
  METRICS_TOKEN: z.string().optional(),
  HOSTLOGS_LOCAL_HOST: z.string().optional(),
  HOSTLOG_NGINX_DIR: z.string().default("/var/log/nginx"),
  HOSTLOG_NGINX_ACCESS_FILE: z.string().default("access.log"),
  HOSTLOG_NGINX_ERROR_FILE: z.string().default("error.log"),
  PM2_LOG_DIR: z.string().optional(),
  PM2_APP_NAME: z.string().default("containeryard-api"),
});

const parsedEnv = envSchema.parse(rawEnv);
export const remoteHostsConfig = parseRemoteHostsEnv(
  parsedEnv.CY_REMOTE_HOSTS,
  parsedEnv.CY_LOCAL_HOST_ID,
);

export const env = {
  ...parsedEnv,
  HOSTLOGS_LOCAL_HOST: parsedEnv.HOSTLOGS_LOCAL_HOST || parsedEnv.CY_LOCAL_HOST_ID,
};

export const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
