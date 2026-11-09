/* global __dirname */
/**
 * The only PM2 definition for ContainerYard (legacy bare-metal deployments).
 *
 * Mirrors the process that has run in production since 2026-05:
 * a single fork-mode process that runs `npm run start`
 * (node -r dotenv/config dist/index.js, which loads .env from cwd).
 *
 * Keep it a single fork process: rate limiters, live log streams (SSE)
 * and the background workers are per-process, so cluster mode would
 * multiply them.
 *
 *   pm2 startOrReload ecosystem.config.cjs   # start or apply changes
 *   pm2 save                                 # persist across reboots
 */
module.exports = {
  apps: [
    {
      name: "containeryard-api",
      // Run from the checkout this file lives in.
      cwd: __dirname,
      script: "npm",
      args: "run start",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: "5008",
      },
    },
  ],
};
