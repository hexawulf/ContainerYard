import session from "express-session";
import RedisStore from "connect-redis";
import Redis from "ioredis";
import type { RequestHandler } from "express";
import { env } from "./env";
import { log } from "../../vite";

export const redisClient = new Redis(env.REDIS_URL, {
  lazyConnect: false,
  maxRetriesPerRequest: null,
});

redisClient.on("error", (error) => {
  log(`Redis error: ${(error as Error).message}`, "redis");
});

const store = new RedisStore({
  client: redisClient,
  prefix: `${env.COOKIE_NAME}:`,
});

export const sessionMiddleware: RequestHandler = session({
  name: env.COOKIE_NAME,
  secret: env.SESSION_SECRET,
  store,
  resave: false,
  saveUninitialized: true, // Allow sessions to be saved even if not modified
  proxy: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: true, // TLS at Nginx
    domain: env.COOKIE_DOMAIN ?? undefined,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});
