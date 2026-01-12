#!/bin/bash

# Azure App Service Startup Script for MatchPod Server

echo "🚀 Starting MatchPod Server..."

# Set NODE_ENV to production
export NODE_ENV=production

echo "📝 Environment: $NODE_ENV"
echo "📝 Node version: $(node --version)"
echo "📝 NPM version: $(npm --version)"

# Run database migrations if needed
# Add migration commands here when implemented
# npm run migrate

echo "✅ Starting server..."
node dist/index.js

