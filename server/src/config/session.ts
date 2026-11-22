import session from "express-session";
import { RedisStore } from "connect-redis";
import { createClient } from "redis";
import type { RequestHandler } from "express";
import { env } from "./env";
import { log } from "../../vite";

// node-redis (connect-redis 8+ supports only this client). Commands issued
// while it connects are queued, and the default reconnect strategy retries
// indefinitely, like ioredis did with maxRetriesPerRequest: null.
export const redisClient = createClient({ url: env.REDIS_URL });

redisClient.on("error", (error) => {
  log(`Redis error: ${(error as Error).message}`, "redis");
});

redisClient.connect().catch((error) => {
  log(`Redis connect failed: ${(error as Error).message}`, "redis");
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
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    sameSite: env.COOKIE_SAMESITE,
    secure: true, // TLS at Nginx
    domain: env.COOKIE_DOMAIN ?? undefined,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});
