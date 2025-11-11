#!/bin/bash
# ContainerYard restart script for piapps server

echo "Restarting ContainerYard application..."

# Navigate to the project directory
cd /home/zk/projects/ContainerYard

# Install dependencies if needed
npm ci || npm install

# Generate Prisma client
npx prisma generate

# Build the application
npm run build

# Restart the PM2 process
echo "Restarting PM2 process..."
pm2 restart containeryard --update-env

# Show logs
echo "Showing recent logs..."
pm2 logs containeryard --lines 50

echo "ContainerYard restart completed!"