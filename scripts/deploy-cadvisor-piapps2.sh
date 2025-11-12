#!/bin/bash
# Script to deploy cAdvisor on piapps2 host
# Run this script on the piapps2 host (192.168.50.120)

echo "Deploying cAdvisor on piapps2..."

# Stop and remove existing cAdvisor container if it exists
docker rm -f cadvisor 2>/dev/null || true

# Run cAdvisor container
docker run -d \
  --name cadvisor \
  --restart unless-stopped \
  --privileged \
  -p 8082:8080 \
  -v /:/rootfs:ro \
  -v /var/run:/var/run:rw \
  -v /sys:/sys:ro \
  -v /var/lib/docker/:/var/lib/docker:ro \
  -v /sys/fs/cgroup:/sys/fs/cgroup:ro \
  gcr.io/cadvisor/cadvisor:latest

echo "cAdvisor deployed successfully on port 8082"
echo "You can verify it's running by visiting: http://192.168.50.120:8082"
echo "Or by running: curl -s http://192.168.50.120:8082/api/v1.3/subcontainers | jq '.[0] | keys'"