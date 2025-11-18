export const HOST_LOGS: Record<string, Record<string, string>> = {
  piapps: {
    nginx_access: '/var/log/nginx/container.piapps.dev.access.log',
    nginx_error:  '/var/log/nginx/container.piapps.dev.error.log',
    pm2_out:      process.env.HOME + '/.pm2/logs/containeryard-out.log',
    pm2_err:      process.env.HOME + '/.pm2/logs/containeryard-error.log',
    grafana:      '/var/log/grafana/grafana.log',
    prometheus:   '/var/log/prometheus/prometheus.log',
  },
  piapps2: {
    nginx_access: '/var/log/nginx/container.piapps.dev.access.log',
    nginx_error:  '/var/log/nginx/container.piapps.dev.error.log',
    pm2_out:      process.env.HOME + '/.pm2/logs/containeryard-out.log',
    pm2_err:      process.env.HOME + '/.pm2/logs/containeryard-error.log',
    grafana:      '/var/log/grafana/grafana.log',
    prometheus:   '/var/log/prometheus/prometheus.log',
  },
  synology: {
    nginx_access: '/var/log/nginx/container.piapps.dev.access.log',
    nginx_error:  '/var/log/nginx/container.piapps.dev.error.log',
    pm2_out:      process.env.HOME + '/.pm2/logs/containeryard-out.log',
    pm2_err:      process.env.HOME + '/.pm2/logs/containeryard-error.log',
    grafana:      '/var/log/grafana/grafana.log',
    prometheus:   '/var/log/prometheus/prometheus.log',
  }
};

export const FALLBACK_DOCKER: Record<string, string> = {
  grafana:    'crypto-agent-grafana-1',
  prometheus: 'crypto-agent-prometheus-1',
};