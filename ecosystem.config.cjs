module.exports = {
  apps: [{
    name: "containeryard",
    script: "dist/index.js",
    cwd: "/home/zk/projects/ContainerYard",
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      PORT: "5008",
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      PROVIDER: "DOCKER",
      DOCKER_HOST: "unix:///var/run/docker.sock",
      ALLOWED_ORIGIN: "https://container.piapps.dev",
      COOKIE_NAME: "cy.sid",
      COOKIE_DOMAIN: "container.piapps.dev",
      COOKIE_SAMESITE: "lax"
      // Optional if your app supports it:
      // TRUST_PROXY: "1"
    }
  }]
}
