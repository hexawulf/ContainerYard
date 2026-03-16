module.exports = {
  apps: [
    {
      name: 'containeryard',
      cwd: '/home/zk/projects/ContainerYard',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      watch: false,
      time: true
    }
  ]
};
