# Deployment Guide

This guide covers deploying the Automatic Free Model Tracking System (AFMTS) to production environments, with a focus on Oracle Cloud ARM64 instances.

## Oracle Cloud Deployment

### VM.Standard.A1.Flex Configuration

**Recommended Instance**: VM.Standard.A1.Flex with 4 OCPUs and 24GB RAM

**Instance Specifications**:
- **CPU**: 4 ARM64 cores (Ampere Altra)
- **RAM**: 24GB
- **Storage**: 200GB NVMe SSD
- **Network**: 1Gbps bandwidth
- **Cost**: ~$0.10/hour (varies by region)

### Oracle Cloud Setup

#### 1. Create Oracle Cloud Account

1. Sign up at [oracle.com/cloud](https://www.oracle.com/cloud/)
2. Choose "Always Free" tier or paid account
3. Set up billing (if applicable)

#### 2. Launch ARM64 Instance

**Using Oracle Cloud Console**:

1. Navigate to Compute → Instances
2. Click "Create Instance"
3. Configure instance:
   - **Name**: `afmts-production`
   - **Image**: Ubuntu 22.04 (ARM64)
   - **Shape**: VM.Standard.A1.Flex
   - **OCPUs**: 4
   - **Memory**: 24GB
   - **Boot Volume**: 200GB
4. Add SSH keys for access
5. Create Virtual Cloud Network (VCN) if needed

**Using OCI CLI**:

```bash
# Install OCI CLI
curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh | bash

# Configure CLI
oci setup config

# Launch instance
oci compute instance launch \
  --compartment-id $COMPARTMENT_ID \
  --availability-domain $AD \
  --shape VM.Standard.A1.Flex \
  --image-id $UBUNTU_ARM64_IMAGE_ID \
  --subnet-id $SUBNET_ID \
  --ssh-authorized-keys-file ~/.ssh/id_rsa.pub \
  --display-name afmts-production \
  --shape-config '{"ocpus": 4, "memoryInGBs": 24}'
```

#### 3. Security Configuration

**Security List Configuration**:

```bash
# Allow SSH (port 22)
oci network security-list update \
  --security-list-id $SECURITY_LIST_ID \
  --ingress-security-rules '[
    {
      "source": "0.0.0.0/0",
      "protocol": "6",
      "tcpOptions": {"destinationPortRange": {"min": 22, "max": 22}}
    }
  ]'

# Allow HTTP/HTTPS (ports 80, 443)
oci network security-list update \
  --security-list-id $SECURITY_LIST_ID \
  --ingress-security-rules '[
    {
      "source": "0.0.0.0/0",
      "protocol": "6",
      "tcpOptions": {"destinationPortRange": {"min": 80, "max": 80}}
    },
    {
      "source": "0.0.0.0/0",
      "protocol": "6",
      "tcpOptions": {"destinationPortRange": {"min": 443, "max": 443}}
    }
  ]'
```

### Docker Deployment on Oracle Cloud

#### 1. Install Docker

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.18.1/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### 2. Deploy AFMTS

```bash
# Clone repository
git clone https://github.com/your-org/Your-PaL-MoE-v0.3.git
cd Your-PaL-MoE-v0.3

# Create environment file
cp .env.example .env
nano .env  # Configure your settings

# Deploy with Docker Compose
docker-compose -f deployment/docker-compose.oracle.yml up -d

# Check deployment status
docker-compose ps
docker-compose logs -f afmts-app
```

#### 3. Configure Reverse Proxy

**Install Nginx**:

```bash
sudo apt install nginx -y

# Create AFMTS site configuration
sudo nano /etc/nginx/sites-available/afmts
```

**Nginx Configuration**:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Proxy to AFMTS
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # API rate limiting
    location /api/ {
        limit_req zone=api burst=10 nodelay;
        proxy_pass http://localhost:3000;
        # ... same proxy settings
    }
}

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
```

**Enable Site**:

```bash
sudo ln -s /etc/nginx/sites-available/afmts /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 4. SSL Certificate Setup

**Using Let's Encrypt**:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Set up auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Database Setup

#### PostgreSQL Configuration

**Docker Compose PostgreSQL Service**:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: afmts
      POSTGRES_USER: afmts_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./deployment/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U afmts_user -d afmts"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
```

**Database Initialization Script** (`deployment/postgres/init.sql`):

```sql
-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_requests_created_at ON requests(created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_requests_user_id ON requests(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_provider ON usage(provider);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_models_provider ON models(provider);

-- Create partitions for large tables (if needed)
-- CREATE TABLE requests_y2025m10 PARTITION OF requests FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
```

#### Redis Configuration

**Docker Compose Redis Service**:

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
  volumes:
    - redis_data:/data
  ports:
    - "6379:6379"
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 30s
    timeout: 10s
    retries: 3

volumes:
  redis_data:
```

### Monitoring Setup

#### System Monitoring

**Install Prometheus Node Exporter**:

```bash
# Download and install
wget https://github.com/prometheus/node_exporter/releases/download/v1.6.1/node_exporter-1.6.1.linux-arm64.tar.gz
tar xvf node_exporter-1.6.1.linux-arm64.tar.gz
sudo mv node_exporter-1.6.1.linux-arm64/node_exporter /usr/local/bin/

# Create service
sudo nano /etc/systemd/system/node_exporter.service
```

**Systemd Service**:

```ini
[Unit]
Description=Node Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
```

**Start Service**:

```bash
sudo useradd -rs /bin/false node_exporter
sudo systemctl daemon-reload
sudo systemctl start node_exporter
sudo systemctl enable node_exporter
```

#### Application Monitoring

**Docker Compose Monitoring Stack**:

```yaml
monitoring:
  image: prom/prometheus:latest
  volumes:
    - ./deployment/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    - prometheus_data:/prometheus
  ports:
    - "9090:9090"
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
    - '--storage.tsdb.path=/prometheus'
    - '--web.console.libraries=/etc/prometheus/console_libraries'
    - '--web.console.templates=/etc/prometheus/consoles'
    - '--storage.tsdb.retention.time=200h'
    - '--web.enable-lifecycle'

grafana:
  image: grafana/grafana:latest
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
  volumes:
    - grafana_data:/var/lib/grafana
    - ./deployment/monitoring/grafana/provisioning:/etc/grafana/provisioning
  ports:
    - "3001:3000"
  depends_on:
    - prometheus
```

### Backup Strategy

#### Automated Backups

**Database Backup Script** (`scripts/backup.sh`):

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="/opt/afmts/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=7

# Create backup directory
mkdir -p $BACKUP_DIR

# Database backup
docker exec afmts_postgres_1 pg_dump -U afmts_user -d afmts > $BACKUP_DIR/db_backup_$TIMESTAMP.sql

# Configuration backup
tar -czf $BACKUP_DIR/config_backup_$TIMESTAMP.tar.gz \
  .env \
  providers.csv \
  deployment/

# Compress database backup
gzip $BACKUP_DIR/db_backup_$TIMESTAMP.sql

# Clean old backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

# Upload to cloud storage (optional)
# aws s3 cp $BACKUP_DIR/ s3://afmts-backups/ --recursive
```

**Schedule Backups**:

```bash
# Add to crontab
0 2 * * * /opt/afmts/scripts/backup.sh
```

#### Backup Verification

**Verification Script** (`scripts/verify-backup.sh`):

```bash
#!/bin/bash

BACKUP_FILE=$1

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Verify database backup
gunzip -c $BACKUP_FILE | head -20 | grep -q "PostgreSQL database dump"
if [ $? -eq 0 ]; then
    echo "Database backup verification: PASSED"
else
    echo "Database backup verification: FAILED"
    exit 1
fi

# Check backup size
BACKUP_SIZE=$(stat -c%s "$BACKUP_FILE")
if [ $BACKUP_SIZE -gt 1000000 ]; then
    echo "Backup size verification: PASSED ($BACKUP_SIZE bytes)"
else
    echo "Backup size verification: FAILED (too small)"
    exit 1
fi

echo "Backup verification completed successfully"
```

### Scaling Configuration

#### Horizontal Scaling

**Load Balancer Setup**:

```nginx
upstream afmts_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://afmts_backend;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

**Multiple AFMTS Instances**:

```yaml
services:
  afmts-app-1:
    # ... AFMTS config
    ports:
      - "3000:3000"

  afmts-app-2:
    # ... AFMTS config
    ports:
      - "3001:3000"

  afmts-app-3:
    # ... AFMTS config
    ports:
      - "3002:3000"
```

#### Vertical Scaling

**Resource Allocation**:

```yaml
services:
  afmts-app:
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 8G
        reservations:
          cpus: '2.0'
          memory: 4G
```

### Security Hardening

#### Network Security

**Firewall Configuration**:

```bash
# UFW configuration
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable
```

**Fail2Ban Setup**:

```bash
sudo apt install fail2ban -y
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

#### System Security

**SSH Hardening**:

```bash
# Edit /etc/ssh/sshd_config
sudo nano /etc/ssh/sshd_config

# Disable root login
PermitRootLogin no

# Use key-based authentication only
PasswordAuthentication no

# Change default port (optional)
Port 2222

sudo systemctl reload sshd
```

**Automatic Updates**:

```bash
# Enable unattended upgrades
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

### Performance Optimization

#### Oracle Cloud Specific

**ARM64 Optimizations**:

```bash
# Use ARM64 optimized packages
sudo apt install postgresql-15 postgresql-client-15 redis-server

# Configure PostgreSQL for ARM64
# Edit /etc/postgresql/15/main/postgresql.conf
shared_buffers = 6GB
effective_cache_size = 18GB
work_mem = 128MB
maintenance_work_mem = 2GB
```

**Storage Optimization**:

```bash
# Use NVMe optimizations
echo "deadline" | sudo tee /sys/block/nvme0n1/queue/scheduler

# Database on NVMe
# Mount /var/lib/postgresql on NVMe volume
```

#### Application Optimization

**Node.js Configuration**:

```bash
# Set Node.js options
export NODE_OPTIONS="--max-old-space-size=6144 --optimize-for-size"
```

**Docker Optimizations**:

```yaml
services:
  afmts-app:
    image: afmts:latest
    environment:
      - NODE_ENV=production
    deploy:
      resources:
        limits:
          memory: 6G
        reservations:
          memory: 4G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Monitoring and Alerting

#### Oracle Cloud Monitoring

**Enable Oracle Cloud Monitoring**:

```bash
# Install OCI monitoring agent
wget https://objectstorage.us-ashburn-1.oraclecloud.com/n/id3devl2sq4w/b/monitoring/o/monitoring-agent-installer.sh
chmod +x monitoring-agent-installer.sh
sudo ./monitoring-agent-installer.sh
```

#### Application Alerting

**Alert Manager Configuration**:

```yaml
route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'email'
  routes:
  - match:
      severity: critical
    receiver: 'pagerduty'

receivers:
- name: 'email'
  email_configs:
  - to: 'alerts@yourcompany.com'
    from: 'alerts@afmts.com'
    smarthost: 'smtp.gmail.com:587'
    auth_username: 'alerts@afmts.com'
    auth_password: 'your-password'
```

### Troubleshooting Deployment

#### Common Issues

**Docker Container Fails to Start**:

```bash
# Check logs
docker-compose logs afmts-app

# Check resource usage
docker stats

# Verify environment variables
docker-compose exec afmts-app env
```

**Database Connection Issues**:

```bash
# Test database connectivity
docker-compose exec postgres psql -U afmts_user -d afmts -c "SELECT version();"

# Check database logs
docker-compose logs postgres
```

**High Memory Usage**:

```bash
# Monitor memory usage
docker stats

# Check application memory
docker-compose exec afmts-app ps aux --sort=-%mem | head -10

# Adjust memory limits
docker-compose up -d --scale afmts-app=2
```

**Network Connectivity Issues**:

```bash
# Test internal connectivity
docker-compose exec afmts-app curl -f http://postgres:5432

# Check firewall rules
sudo ufw status

# Verify security lists in Oracle Cloud
oci network security-list list -c $COMPARTMENT_ID
```

### Backup and Recovery

#### Disaster Recovery

**Recovery Procedure**:

```bash
# Stop current deployment
docker-compose down

# Restore database
docker-compose exec postgres psql -U afmts_user -d afmts < backup.sql

# Restore configuration
tar -xzf config_backup.tar.gz

# Restart deployment
docker-compose up -d

# Verify system health
curl http://localhost/health
```

#### Cross-Region Backup

**Oracle Cloud Object Storage**:

```bash
# Install OCI CLI
pip install oci-cli

# Configure backup to Object Storage
oci os object put \
  --bucket-name afmts-backups \
  --file backup.sql.gz \
  --name "db-$(date +%Y%m%d-%H%M%S).sql.gz"
```

### Cost Optimization

#### Oracle Cloud Cost Management

**Monitoring Costs**:

```bash
# Check current usage
oci usage-api usage-summary request-summarized-usages \
  --compartment-id $COMPARTMENT_ID \
  --granularity DAILY \
  --time-usage-started 2025-10-01T00:00:00Z \
  --time-usage-ended 2025-10-15T00:00:00Z
```

**Cost Optimization Strategies**:

1. **Use Always Free Resources**: Utilize Oracle's Always Free tier
2. **Auto Scaling**: Scale down during low usage periods
3. **Reserved Instances**: Use reserved instances for predictable workloads
4. **Storage Optimization**: Use Oracle Cloud Object Storage for backups

### Maintenance Procedures

#### Regular Maintenance

**Weekly Tasks**:
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Rotate logs
sudo logrotate -f /etc/logrotate.conf

# Clean Docker
docker system prune -f

# Database maintenance
docker-compose exec postgres vacuumdb -U afmts_user -d afmts --analyze
```

**Monthly Tasks**:
```bash
# Security updates
sudo unattended-upgrade

# Backup verification
/opt/afmts/scripts/verify-backup.sh /opt/afmts/backups/latest.sql.gz

# Performance review
# Check metrics in Grafana
```

#### Emergency Maintenance

**System Restart Procedure**:
```bash
# Graceful shutdown
docker-compose down

# System restart
sudo reboot

# Verify after restart
docker-compose up -d
curl http://localhost/health
```

---

**Next**: Learn about [Monitoring and Maintenance](../monitoring/index.md)