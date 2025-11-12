module.exports = {
  apps: [
    {
      name: 'containeryard',
      cwd: '/home/zk/projects/ContainerYard',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PIAPPS2_CADVISOR_URL: 'http://192.168.50.120:18082'
      },
      autorestart: true,
      max_restarts: 10,
      watch: false,
      time: true
    }
  ]
};
