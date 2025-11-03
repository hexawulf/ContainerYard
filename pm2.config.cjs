module.exports = {
  apps: [{
    name: "containeryard",
    script: "dist/index.js",
    cwd: "/home/zk/projects/ContainerYard",
    exec_mode: "cluster",
    instances: "max",
    watch: false,
    node_args: "-r dotenv/config",
    env: {
      NODE_ENV: "production",
      PORT: 5008,
      DOTENV_CONFIG_PATH: "/home/zk/projects/ContainerYard/.env"
    }
  }]
};
