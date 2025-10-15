# Installation and Setup Guide

This guide provides step-by-step instructions for installing and configuring the Automatic Free Model Tracking System (AFMTS) on various platforms.

## Prerequisites

### System Requirements

#### Minimum Requirements
- **CPU**: 2-core ARM64 or x86_64 processor
- **RAM**: 4GB available memory
- **Storage**: 10GB free disk space
- **Network**: Stable internet connection

#### Recommended Requirements
- **CPU**: 4-core ARM64 processor (Oracle Cloud VM.Standard.A1.Flex)
- **RAM**: 24GB memory
- **Storage**: 50GB SSD storage
- **Network**: 1Gbps internet connection

### Software Dependencies

#### Required Software
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher (comes with Node.js)
- **Docker**: Version 20.10.0 or higher (for containerized deployment)
- **Docker Compose**: Version 2.0.0 or higher

#### Optional Software
- **PostgreSQL**: Version 13.0 or higher (if not using Docker)
- **Redis**: Version 6.0 or higher (if not using Docker)
- **Git**: For cloning the repository

### Operating System Support

#### Primary Support
- **Linux**: Ubuntu 20.04+, CentOS 8+, Oracle Linux 8+
- **macOS**: Monterey (12.0) or later
- **Windows**: Windows 10/11 with WSL2

#### Cloud Platforms
- **Oracle Cloud**: VM.Standard.A1.Flex (ARM64) - Recommended
- **AWS**: EC2 instances with ARM64 support
- **Google Cloud**: Compute Engine with ARM64
- **Azure**: VMs with ARM64 support

## Installation Methods

### Method 1: Docker Deployment (Recommended)

#### Quick Start with Docker Compose

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/Your-PaL-MoE-v0.3.git
   cd Your-PaL-MoE-v0.3
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the system**:
   ```bash
   docker-compose -f deployment/docker-compose.oracle.yml up -d
   ```

4. **Verify installation**:
   ```bash
   docker-compose logs -f afmts-app
   ```

#### Docker Compose Services

The deployment includes the following services:

```yaml
services:
  afmts-app:        # Main AFMTS application
  postgres:         # PostgreSQL database
  redis:           # Redis cache
  backup:          # Automated backup service
  monitoring:      # System monitoring
```

### Method 2: Native Installation

#### Step 1: Install Node.js and npm

**Ubuntu/Debian**:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**CentOS/RHEL**:
```bash
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

**macOS** (using Homebrew):
```bash
brew install node
```

**Windows** (using Chocolatey):
```bash
choco install nodejs
```

#### Step 2: Install PostgreSQL

**Ubuntu/Debian**:
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**CentOS/RHEL**:
```bash
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Step 3: Install Redis

**Ubuntu/Debian**:
```bash
sudo apt-get install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

**CentOS/RHEL**:
```bash
sudo yum install redis
sudo systemctl start redis
sudo systemctl enable redis
```

#### Step 4: Clone and Install AFMTS

```bash
git clone https://github.com/your-org/Your-PaL-MoE-v0.3.git
cd Your-PaL-MoE-v0.3
npm install
```

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/afmts
REDIS_URL=redis://localhost:6379

# Server Configuration
PORT=3000
NODE_ENV=production
HOST=0.0.0.0

# Security Configuration
JWT_SECRET=your-super-secure-jwt-secret-here
API_KEY_SALT=your-api-key-salt-here

# Provider API Keys (optional - can be configured via UI)
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
HUGGINGFACE_API_KEY=hf_your-huggingface-key

# Monitoring Configuration
ENABLE_MONITORING=true
MONITORING_INTERVAL=30000
HEALTH_CHECK_TIMEOUT=10000

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/afmts.log
LOG_MAX_SIZE=10m
LOG_MAX_FILES=5

# Cache Configuration
CACHE_TTL=3600000
CACHE_MAX_MEMORY=512mb

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX_REQUESTS=1000
```

### Provider Configuration

#### CSV-Based Configuration

Create a `providers.csv` file with the following format:

```csv
provider,name,api_key,base_url,models_endpoint,rate_limit,timeout,enabled
openai,OpenAI,sk-your-key,https://api.openai.com/v1,/v1/models,60,30000,true
anthropic,Anthropic,sk-ant-your-key,https://api.anthropic.com,/v1/models,50,30000,true
huggingface,HuggingFace,hf_your-key,https://huggingface.co/api,/models,100,30000,true
```

#### Environment Variable Configuration

Alternatively, configure providers using environment variables:

```bash
# Provider Configuration
PROVIDER_OPENAI_API_KEY=sk-your-openai-key
PROVIDER_OPENAI_BASE_URL=https://api.openai.com/v1
PROVIDER_OPENAI_MODELS_ENDPOINT=/v1/models
PROVIDER_OPENAI_RATE_LIMIT=60
PROVIDER_OPENAI_TIMEOUT=30000
PROVIDER_OPENAI_ENABLED=true

PROVIDER_ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
PROVIDER_ANTHROPIC_BASE_URL=https://api.anthropic.com
PROVIDER_ANTHROPIC_MODELS_ENDPOINT=/v1/models
PROVIDER_ANTHROPIC_RATE_LIMIT=50
PROVIDER_ANTHROPIC_TIMEOUT=30000
PROVIDER_ANTHROPIC_ENABLED=true
```

### Database Initialization

#### Using Docker (Recommended)

The database will be automatically initialized when you start the Docker containers.

#### Manual Database Setup

1. **Create database and user**:
   ```sql
   CREATE DATABASE afmts;
   CREATE USER afmts_user WITH ENCRYPTED PASSWORD 'your-password';
   GRANT ALL PRIVILEGES ON DATABASE afmts TO afmts_user;
   ```

2. **Run migrations**:
   ```bash
   npm run migrate
   ```

3. **Seed initial data** (optional):
   ```bash
   npm run seed
   ```

## Starting the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

### Using PM2 (Recommended for Production)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Verification

### Health Check

Test that the system is running correctly:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-15T02:43:53.446Z",
  "version": "0.3.0",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "providers": "healthy"
  }
}
```

### API Test

Test the main API endpoint:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{
    "messages": [{"role": "user", "content": "Hello, world!"}],
    "model": "auto"
  }'
```

### Dashboard Access

Access the monitoring dashboard at:
```
http://localhost:3000/dashboard
```

## Troubleshooting Installation Issues

### Common Issues

#### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000
# Kill the process
kill -9 <PID>
```

#### Database Connection Failed
```bash
# Check PostgreSQL status
sudo systemctl status postgresql
# Check connection
psql -h localhost -U afmts_user -d afmts
```

#### Redis Connection Failed
```bash
# Check Redis status
sudo systemctl status redis
# Test connection
redis-cli ping
```

#### Node.js Version Issues
```bash
# Check Node.js version
node --version
# Update Node.js if necessary
npm install -g n
n latest
```

### Log Analysis

Check application logs for errors:

```bash
# Docker logs
docker-compose logs -f afmts-app

# Native installation logs
tail -f logs/afmts.log
```

### Performance Tuning

#### Memory Configuration
```bash
# Set Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
```

#### Database Optimization
```sql
-- Create indexes for better performance
CREATE INDEX idx_model_provider ON models(provider_id);
CREATE INDEX idx_request_timestamp ON requests(created_at);
```

## Security Setup

### SSL/TLS Configuration

1. **Obtain SSL certificate** (Let's Encrypt example):
   ```bash
   sudo apt-get install certbot
   certbot certonly --standalone -d your-domain.com
   ```

2. **Configure HTTPS in AFMTS**:
   ```bash
   export SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
   export SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem
   export FORCE_HTTPS=true
   ```

### Firewall Configuration

**Ubuntu/Debian**:
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw --force enable
```

**CentOS/RHEL**:
```bash
sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

## Backup and Recovery

### Automated Backups

The system includes automated backup functionality:

```bash
# Configure backup settings in .env
BACKUP_ENABLED=true
BACKUP_INTERVAL=86400000  # 24 hours
BACKUP_RETENTION=7        # 7 days
BACKUP_PATH=/opt/afmts/backups
```

### Manual Backup

```bash
# Database backup
pg_dump -U afmts_user -h localhost afmts > backup.sql

# Configuration backup
cp .env .env.backup
cp providers.csv providers.csv.backup
```

### Recovery Procedure

```bash
# Stop the application
docker-compose down

# Restore database
psql -U afmts_user -h localhost afmts < backup.sql

# Restore configuration
cp .env.backup .env
cp providers.csv.backup providers.csv

# Restart the application
docker-compose up -d
```

## Monitoring Setup

### System Monitoring

Enable comprehensive monitoring:

```bash
# Install monitoring dependencies
npm install -g pm2
pm2 install pm2-logrotate
pm2 install pm2-server-monit
```

### Log Rotation

Configure log rotation to prevent disk space issues:

```bash
# Add to /etc/logrotate.d/afmts
/opt/afmts/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    notifempty
    create 0644 afmts afmts
    postrotate
        pm2 reloadLogs
    endscript
}
```

## Next Steps

After successful installation:

1. **Configure Providers**: Add your API keys and provider settings
2. **Test Integration**: Verify API endpoints are working
3. **Monitor Performance**: Set up monitoring and alerts
4. **Scale as Needed**: Adjust resources based on usage patterns

For detailed API documentation, see the [API Reference](../api/index.md).
For deployment on Oracle Cloud, see the [Deployment Guide](../deployment/index.md).