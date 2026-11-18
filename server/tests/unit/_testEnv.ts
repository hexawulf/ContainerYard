/**
 * Side-effect import: minimal env so modules that parse the env schema at
 * import time (config/env.ts) can be loaded in unit tests. Import it first.
 */
process.env.SESSION_SECRET ??= "0123456789abcdef0123456789abcdef";
process.env.ALLOWED_ORIGINS ??= "http://127.0.0.1:5008";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.ADMIN_EMAIL ??= "admin@example.invalid";
process.env.ADMIN_PASSWORD ??= "TestAdminPassword123!";
process.env.DATABASE_URL ??= "file:/tmp/cy-unit-nonexistent.db";

export {};
