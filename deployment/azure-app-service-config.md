# Azure App Service Configuration for MatchPod

## Overview

This document provides the complete setup for deploying the MatchPod Express server to Azure App Service.

## Prerequisites

- Azure account with active subscription
- Azure CLI installed
- Node.js 20 LTS runtime
- MongoDB Atlas database
- Azure Cache for Redis instance
- Azure Blob Storage account

## App Service Creation

### 1. Create App Service

```bash
# Login to Azure
az login

# Create resource group
az group create --name matchpod-rg --location eastus

# Create App Service Plan (Linux, Standard tier)
az appservice plan create \
  --name matchpod-plan \
  --resource-group matchpod-rg \
  --is-linux \
  --sku S1

# Create Web App
az webapp create \
  --resource-group matchpod-rg \
  --plan matchpod-plan \
  --name matchpod-api \
  --runtime "NODE|20-lts"
```

### 2. Configure App Settings

Set all environment variables as Application Settings:

```bash
# Database
az webapp config appsettings set \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --settings \
    MONGODB_URI="<your-mongodb-atlas-connection-string>"

# JWT Secrets
az webapp config appsettings set \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --settings \
    JWT_SECRET="<your-jwt-secret>" \
    JWT_REFRESH_SECRET="<your-refresh-secret>" \
    JWT_ISSUER="matchpod-api" \
    JWT_AUDIENCE="matchpod-app"

# Azure Cache for Redis
az webapp config appsettings set \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --settings \
    REDIS_HOST="<name>.redis.cache.windows.net" \
    REDIS_PORT="6380" \
    REDIS_PASSWORD="<primary-key>" \
    REDIS_TLS="true" \
    ENABLE_REDIS="true"

# Azure Blob Storage
az webapp config appsettings set \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --settings \
    AZURE_STORAGE_CONNECTION_STRING="<your-connection-string>"

# CORS Origins
az webapp config appsettings set \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --settings \
    CORS_ORIGIN="https://yourdomain.com,https://app.yourdomain.com"

# Match Algorithm Weights
az webapp config appsettings set \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --settings \
    MATCH_WEIGHT_BUDGET="0.25" \
    MATCH_WEIGHT_LOCATION="0.20" \
    MATCH_WEIGHT_LIFESTYLE="0.20" \
    MATCH_WEIGHT_SCHEDULE="0.15" \
    MATCH_WEIGHT_CLEANLINESS="0.10" \
    MATCH_WEIGHT_PETS="0.05" \
    MATCH_WEIGHT_GENDER="0.05"

# Push Notifications (disabled by default)
az webapp config appsettings set \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --settings \
    ENABLE_PUSH_NOTIFICATIONS="false"

# Node Environment
az webapp config appsettings set \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --settings \
    NODE_ENV="production" \
    PORT="8080"
```

### 3. Configure Startup Command

```bash
az webapp config set \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --startup-file "node dist/index.js"
```

## Deployment Options

### Option 1: Deploy from GitHub (Recommended)

1. Connect GitHub repository to Azure App Service:
   ```bash
   az webapp deployment source config \
     --resource-group matchpod-rg \
     --name matchpod-api \
     --repo-url https://github.com/your-username/matchpod \
     --branch main \
     --manual-integration
   ```

2. Configure build automation:
   - Azure will automatically run `npm install` and `npm run build`
   - Build artifact will be in `server/dist/`

### Option 2: Deploy via Azure CLI

```bash
# Build locally
cd server
npm install
npm run build

# Create deployment package
cd ..
zip -r deploy.zip server/dist server/node_modules server/package.json

# Deploy to Azure
az webapp deployment source config-zip \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --src deploy.zip
```

### Option 3: Deploy via FTP

1. Get FTP credentials:
   ```bash
   az webapp deployment list-publishing-credentials \
     --resource-group matchpod-rg \
     --name matchpod-api
   ```

2. Use FTP client to upload `server/dist/` and `server/node_modules/`

## Enable Application Insights

```bash
# Create Application Insights
az monitor app-insights component create \
  --app matchpod-insights \
  --location eastus \
  --resource-group matchpod-rg

# Get instrumentation key
INSTRUMENTATION_KEY=$(az monitor app-insights component show \
  --app matchpod-insights \
  --resource-group matchpod-rg \
  --query instrumentationKey \
  --output tsv)

# Set instrumentation key
az webapp config appsettings set \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --settings \
    APPINSIGHTS_INSTRUMENTATIONKEY="$INSTRUMENTATION_KEY"
```

## Configure Custom Domain

```bash
# Map custom domain
az webapp config hostname add \
  --resource-group matchpod-rg \
  --webapp-name matchpod-api \
  --hostname api.yourdomain.com

# Enable HTTPS
az webapp config ssl bind \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --certificate-thumbprint <thumbprint> \
  --ssl-type SNI
```

## Health Check Configuration

```bash
# Enable health check
az webapp config set \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --health-check-path "/api/health"
```

## Scaling Configuration

### Manual Scaling

```bash
# Scale to 2 instances
az appservice plan update \
  --resource-group matchpod-rg \
  --name matchpod-plan \
  --number-of-workers 2
```

### Auto-Scaling Rules

```bash
# Enable auto-scaling based on CPU
az monitor autoscale create \
  --resource-group matchpod-rg \
  --resource matchpod-plan \
  --resource-type Microsoft.Web/serverfarms \
  --name matchpod-autoscale \
  --min-count 1 \
  --max-count 5 \
  --count 1

# Add scale-out rule (CPU > 75%)
az monitor autoscale rule create \
  --resource-group matchpod-rg \
  --autoscale-name matchpod-autoscale \
  --condition "CpuPercentage > 75 avg 5m" \
  --scale out 1

# Add scale-in rule (CPU < 25%)
az monitor autoscale rule create \
  --resource-group matchpod-rg \
  --autoscale-name matchpod-autoscale \
  --condition "CpuPercentage < 25 avg 5m" \
  --scale in 1
```

## Monitoring & Logs

### View Live Logs

```bash
az webapp log tail \
  --resource-group matchpod-rg \
  --name matchpod-api
```

### Enable Diagnostic Logs

```bash
az webapp log config \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --application-logging filesystem \
  --detailed-error-messages true \
  --failed-request-tracing true \
  --web-server-logging filesystem
```

## Troubleshooting

### Check Application Logs

```bash
az webapp log download \
  --resource-group matchpod-rg \
  --name matchpod-api \
  --log-file logs.zip
```

### SSH into Container

```bash
az webapp ssh \
  --resource-group matchpod-rg \
  --name matchpod-api
```

### Restart Web App

```bash
az webapp restart \
  --resource-group matchpod-rg \
  --name matchpod-api
```

## Security Best Practices

1. **Always use HTTPS** - Configure SSL certificates
2. **Restrict CORS** - Set specific origins, not wildcards
3. **Use Managed Identity** - For accessing Azure resources
4. **Enable Network Security** - Use VNet integration if needed
5. **Regular Updates** - Keep Node.js runtime and dependencies updated
6. **Monitor Logs** - Set up alerts for errors and unusual activity

## Cost Optimization

- Use **S1** tier for production (minimum for custom domains)
- Enable **auto-scaling** to handle traffic spikes
- Use **deployment slots** for staging environment
- Monitor **Application Insights** usage to stay within free tier

## Backup and Disaster Recovery

```bash
# Create backup
az webapp config backup create \
  --resource-group matchpod-rg \
  --webapp-name matchpod-api \
  --container-url "<blob-container-url-with-sas>" \
  --backup-name "matchpod-backup-$(date +%Y%m%d)"
```

## Environment Checklist

- [ ] App Service created with Node 20 LTS
- [ ] All environment variables configured
- [ ] MongoDB Atlas connection verified
- [ ] Azure Cache for Redis configured
- [ ] Azure Blob Storage configured
- [ ] CORS origins set correctly
- [ ] SSL certificate configured
- [ ] Health check endpoint working
- [ ] Application Insights enabled
- [ ] Auto-scaling configured
- [ ] Backup strategy in place

---

**Last Updated**: 2025-10-10
**Maintained by**: MatchPod DevOps Team

