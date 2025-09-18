# Public Server Setup Guide

This guide provides comprehensive instructions for setting up this repository's AI API proxy as a public server. The proxy server acts as a unified interface to multiple AI providers, offering load balancing, security, and rate limiting.

## Overview

The AI API Proxy Server provides:

- 🔒 **Security**: Authentication, rate limiting, input validation, and security headers
- 🔄 **Load Balancing**: Automatic provider fallback and priority-based routing
- 📊 **Monitoring**: Usage tracking, health checks, and audit logging
- 🔑 **API Management**: User management, token counting, and plan-based access
- 🌐 **Multi-Provider Support**: Support for various AI providers (OpenRouter, Pollinations, etc.)

## Prerequisites

### System Requirements

- **Node.js**: Version 16 or higher
- **npm**: Version 8 or higher
- **Memory**: Minimum 512MB RAM (1GB+ recommended)
- **Storage**: Minimum 100MB free space
- **Network**: Internet connection for AI provider APIs

### Required Dependencies

```bash
# Install Node.js if not already installed
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node -v  # Should be v16.0.0 or higher
npm -v   # Should be 8.0.0 or higher
```

## Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/your-repo/Your-PaL-MoE-v0.3.git
cd Your-PaL-MoE-v0.3

# Install dependencies
npm ci --only=production

# Create necessary directories
mkdir -p logs temp backups
chmod 755 logs temp backups
```

### 2. Configure Environment Variables

```bash
# Copy environment template
cp .env.example .env

# Edit the .env file with your configuration
nano .env
```

Essential environment variables:

```bash
# Server Configuration
PORT=8080
HOST=0.0.0.0
NODE_ENV=production

# Security Settings
ENABLE_RATE_LIMITING=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
ENABLE_REQUEST_LOGGING=true
ENABLE_IP_WHITELIST=false
ALLOWED_ORIGINS=["*"]

# Admin API Key (generate a strong key)
ADMIN_API_KEY=your_strong_admin_api_key_here

# Provider Configuration
USE_ENV_KEYS=true  # Use environment variables for API keys
```

### 3. Setup Provider Configuration

#### Option A: Using CSV to JSON Conversion

```bash
# Convert CSV to JSON (if using CSV-based configuration)
node csv-to-providers-secure-final.js
```

#### Option B: Using Environment Variables

```bash
# Extract API keys from CSV to environment variables
node scripts/extract-api-keys-to-env.js

# Load environment variables
source scripts/load-api-keys.sh
```

### 4. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:8080` by default.

## Detailed Configuration

### Security Configuration

The server includes comprehensive security features that should be configured for public deployment:

#### Authentication

```bash
# Enable API key authentication
ENABLE_ENHANCED_AUTH=true
ENABLE_API_KEY_EXPIRY=true
DEFAULT_KEY_EXPIRY_DAYS=30

# API Key rotation
ENABLE_API_KEY_ROTATION=false
API_KEY_ROTATION_INTERVAL=2592000000  # 30 days
```

#### Rate Limiting

```bash
# Global rate limiting
ENABLE_RATE_LIMITING=true
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# Per-endpoint rate limiting
ENABLE_RATE_LIMIT_BY_ENDPOINT=true
RATE_LIMIT_CHAT_COMPLETION_WINDOW_MS=900000
RATE_LIMIT_CHAT_COMPLETION_MAX_REQUESTS=50
RATE_LIMIT_IMAGE_GENERATION_WINDOW_MS=3600000
RATE_LIMIT_IMAGE_GENERATION_MAX_REQUESTS=10
```

#### Security Headers

```bash
# Content Security Policy
ENABLE_CSP=true
CSP_ENABLED=true

# Other security headers
ENABLE_HELMET=true
ENABLE_HSTS=true
ENABLE_XSS_PROTECTION=true
ENABLE_CSRF_PROTECTION=true
```

### Provider Configuration

#### Provider Setup

1. **Create providers.csv** with your provider configurations:

```csv
Name,Base_URL,APIKey,Model(s) list endpoint,Rate Limit/cost info,Notes
OpenRouter,https://openrouter.ai/api/v1/chat/completions,sk-or-xxx,https://openrouter.ai/api/v1/models,20 requests/min,Unified API for multiple models
Pollinations_Text,https://text.pollinations.ai/,,https://text.pollinations.ai/models,15 sec intervals,Free with rate limits
GitHub_Models,https://models.github.ai,ghp_xxx,https://models.github.ai/models,Variable by tier,MUST UPDATE - Azure deprecated Oct 17 2025
```

2. **Convert to JSON**:

```bash
node csv-to-providers-secure-final.js
```

#### Environment Variable Setup

For enhanced security, use environment variables:

```bash
# Set provider API keys
export API_KEY_OPENROUTER=your_openrouter_api_key
export API_KEY_POLLINATIONS=your_pollinations_api_key
export API_KEY_GITHUB_MODELS=your_github_api_key

# Enable environment mode
export USE_ENV_KEYS=true
```

### User Management

#### Creating API Keys

The server automatically manages user API keys. Users are created when they make their first authenticated request.

#### User Plans

Configure user plans in `users.json`:

```json
{
  "users": {
    "sk-demo1234567890": {
      "username": "demo_user",
      "plan": "500k",
      "enabled": true,
      "total_tokens": 0,
      "daily_tokens_used": 0,
      "last_usage_timestamp": null,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

Plan types:
- `0`: Free tier
- `500k`: 500k tokens per day
- `unlimited`: No token limits

## Deployment Options

### 1. Direct Deployment

```bash
# Install dependencies
npm ci --only=production

# Set environment variables
export PORT=8080
export NODE_ENV=production

# Start the server
npm start
```

### 2. Using PM2 (Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Create ecosystem.config.js
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'ai-api-proxy',
    script: 'index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
EOF

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup
```

### 3. Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY .env.example .env

# Install dependencies
RUN npm ci --only=production

# Create directories
RUN mkdir -p logs temp backups

# Copy application code
COPY . .

# Set permissions
RUN chmod 755 logs temp backups

# Expose port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
```

```bash
# Build and run
docker build -t ai-api-proxy .
docker run -d -p 8080:8080 --name ai-proxy ai-api-proxy
```

### 4. Cloud Deployment

#### AWS EC2

```bash
# Launch EC2 instance (Ubuntu 20.04+)
# Install Node.js and dependencies
sudo apt update
sudo apt install -y nodejs npm

# Clone and setup repository
git clone https://github.com/your-repo/Your-PaL-MoE-v0.3.git
cd Your-PaL-MoE-v0.3
npm ci --only=production

# Configure environment
cp .env.example .env
nano .env  # Edit with your configuration

# Setup PM2
npm install -g pm2
pm2 start index.js --name "ai-api-proxy"

# Setup as service
sudo pm2 startup
sudo pm2 save
```

#### Heroku

```bash
# Create Heroku app
heroku create your-app-name

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set PORT=8080
heroku config:set ADMIN_API_KEY=your_admin_key

# Deploy
git push heroku main
```

## SSL/TLS Configuration

### Using Nginx as Reverse Proxy

```nginx
# /etc/nginx/sites-available/ai-api-proxy
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/your/cert.pem;
    ssl_certificate_key /path/to/your/key.pem;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }
}
```

### Using Let's Encrypt for SSL

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

## Monitoring and Logging

### Health Checks

The server includes health check endpoints:

```bash
# Basic health check
curl http://localhost:8080/health

# Detailed health check with provider status
curl http://localhost:8080/health | jq '.'
```

### Monitoring Endpoints

```bash
# Usage statistics
curl http://localhost:8080/v1/usage

# Admin security audit (requires admin API key)
curl -H "Authorization: Bearer your_admin_api_key" http://localhost:8080/admin/security-audit
```

### Log Management

```bash
# View logs
tail -f logs/combined.log

# Monitor security events
tail -f logs/security-audit/security-audit-$(date +%Y-%m-%d).log

# Rotate logs (setup with logrotate)
sudo nano /etc/logrotate.d/ai-api-proxy
```

Logrotate configuration:

```
/var/log/ai-api-proxy/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        pm2 reload ai-api-proxy
    endscript
}
```

## Security Hardening

### File Permissions

```bash
# Set proper file permissions
chmod 600 .env
chmod 600 users.json
chmod 600 providers.json
chmod 755 logs temp backups

# Restrict access to sensitive files
chmod 700 scripts/
```

### Network Security

```bash
# Configure firewall (ufw)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Optional: Restrict access to specific IPs
sudo ufw allow from 192.168.1.0/24 to any port 8080
```

### Regular Security Updates

```bash
# Update dependencies regularly
npm audit fix
npm update

# Monitor for security vulnerabilities
npm audit --audit-level moderate
```

## API Usage for Public Consumers

### Basic Request Format

```bash
# Chat completion
curl -X POST "http://your-domain.com/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
```

### Available Endpoints

- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - Chat completion
- `POST /v1/images/generations` - Image generation
- `GET /v1/usage` - Usage statistics
- `GET /health` - Health check
- `GET /admin/keys` - Admin key management (requires admin API key)

### Rate Limits

The server implements rate limiting based on user plans:

- **Free users**: 50 requests per 15 minutes
- **Paid users**: 100 requests per 15 minutes
- **Admin users**: No rate limits

## Troubleshooting

### Common Issues

#### Server Won't Start

```bash
# Check port availability
netstat -tulpn | grep :8080

# Check Node.js version
node -v

# Check dependencies
npm ls
```

#### Authentication Issues

```bash
# Verify API key format
echo "sk-demo1234567890" | grep -E '^sk-[a-zA-Z0-9_-]{32}$'

# Check user configuration
cat users.json | jq '.users'
```

#### Provider Connection Issues

```bash
# Test provider connectivity
curl -I https://openrouter.ai/api/v1/models

# Check provider configuration
cat providers.json | jq '.endpoints'
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Set debug mode
export LOG_LEVEL=debug
export NODE_ENV=development

# Start with debug output
npm start 2>&1 | tee debug.log
```

## Backup and Recovery

### Configuration Backup

```bash
# Backup configuration files
cp .env .env.backup
cp users.json users.json.backup
cp providers.json providers.json.backup

# Backup scripts
mkdir -p backups/$(date +%Y%m%d)
cp -r . backups/$(date +%Y%m%d)/
```

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/path/to/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR/$DATE

cp .env $BACKUP_DIR/$DATE/
cp users.json $BACKUP_DIR/$DATE/
cp providers.json $BACKUP_DIR/$DATE/

# Compress backup
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz -C $BACKUP_DIR $DATE

# Clean old backups (keep last 7 days)
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/backup_$DATE.tar.gz"
```

## Support and Resources

### Documentation

- [API Error Handling](./api/errors.md)
- [Security Best Practices](./security/best-practices.md)
- [Migration Guide](./security/migration-guide.md)
- [Provider Usage Guide](../g4f_providers_usage_guide.md)

### Community Support

- GitHub Issues: Report bugs and request features
- Discussions: Share deployment tips and configurations
- Wiki: Community-contributed guides and examples

### Professional Support

For enterprise deployments and custom configurations, contact the development team for professional support services.

---

## Next Steps

1. **Test your deployment** with sample API requests
2. **Monitor performance** and adjust configuration as needed
3. **Set up monitoring** and alerting for production
4. **Create documentation** for your end users
5. **Plan for scaling** as usage grows

For more specific deployment scenarios, see the [Deployment Guides](./deployment/) directory.