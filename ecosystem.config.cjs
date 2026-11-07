/**
 * The only PM2 definition for ContainerYard (production on piapps).
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
      cwd: "/home/zk/projects/ContainerYard",
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
