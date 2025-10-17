import { z } from "zod";

const rawEnv = {
  ...process.env,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGIN ?? "",
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5008),
  LOG_LEVEL: z.string().default("info"),
  SESSION_SECRET: z.string().min(32),
  COOKIE_NAME: z.string().default("cy.sid"),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("none"),
  ALLOWED_ORIGINS: z.string().min(1),
  REDIS_URL: z.string().url(),
  DOCKER_HOST: z.string().default("unix:///var/run/docker.sock"),
  SYNOLOGY_CADVISOR_URL: z.string().url(),
  SYNOLOGY_DOZZLE_URL: z.string().url().optional(),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12),
  METRICS_TOKEN: z.string().optional(),
});

export const env = envSchema.parse(rawEnv);

export const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
