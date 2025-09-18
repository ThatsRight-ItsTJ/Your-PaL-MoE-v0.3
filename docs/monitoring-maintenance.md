# Monitoring and Maintenance Guide

This guide provides comprehensive instructions for monitoring and maintaining the AI API Proxy Server in production environments. Proper monitoring and maintenance ensure high availability, performance, and security.

## Overview

Effective monitoring and maintenance includes:

- 📊 **Performance Monitoring**: Track response times, throughput, and resource usage
- 🔒 **Security Monitoring**: Monitor authentication failures, rate limit violations, and suspicious activity
- 📈 **Usage Analytics**: Track API usage, token consumption, and user activity
- 🔧 **Regular Maintenance**: Updates, backups, and performance optimization
- 🚨 **Alerting**: Real-time notifications for critical issues
- 📋 **Logging**: Centralized log collection and analysis

## Monitoring Setup

### 1. Metrics Collection

#### Prometheus Integration

Install Prometheus Node.js exporter:

```bash
# Install Prometheus Node.js exporter
npm install prom-client

# Add to your application
const promClient = require('prom-client');

// Create metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});

const apiTokensUsed = new promClient.Counter({
  name: 'api_tokens_used',
  help: 'Total API tokens used',
  labelNames: ['user', 'model']
});
```

#### Metrics Endpoint

Add to your Express app:

```javascript
// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});
```

### 2. Logging Configuration

#### Structured Logging

```javascript
const winston = require('winston');
const { combine, timestamp, printf, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  return JSON.stringify({
    timestamp,
    level,
    message,
    stack: stack || null,
    ...meta
  });
});

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    errors({ stack: true }),
    logFormat
  ),
  defaultMeta: { service: 'ai-api-proxy' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.id
    });
  });
  
  next();
});
```

### 3. Health Checks

#### Comprehensive Health Check

```javascript
// Enhanced health check
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV,
      checks: {}
    };

    // Database check (if applicable)
    try {
      // health.checks.database = await checkDatabase();
    } catch (error) {
      health.status = 'degraded';
      health.checks.database = { status: 'unhealthy', error: error.message };
    }

    // Provider connectivity check
    try {
      health.checks.providers = await checkProviders();
    } catch (error) {
      health.status = 'degraded';
      health.checks.providers = { status: 'unhealthy', error: error.message };
    }

    // Rate limiting check
    health.checks.rateLimit = {
      status: 'healthy',
      current: getRateLimitCurrent(),
      max: getRateLimitMax()
    };

    // Security check
    health.checks.security = {
      status: 'healthy',
      lastAudit: getLastAuditTime(),
      vulnerabilities: getSecurityVulnerabilities()
    };

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

## Monitoring Tools

### 1. Grafana Dashboard

#### Dashboard JSON Configuration

```json
{
  "dashboard": {
    "id": null,
    "title": "AI API Proxy Monitoring",
    "tags": ["ai-api-proxy"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "HTTP Requests",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{route}}"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "req/s"
          }
        }
      },
      {
        "id": 2,
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          },
          {
            "expr": "histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "50th percentile"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "s"
          }
        }
      },
      {
        "id": 3,
        "title": "Active Connections",
        "type": "gauge",
        "targets": [
          {
            "expr": "active_connections",
            "legendFormat": "Active"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "none",
            "min": 0,
            "max": 1000
          }
        }
      },
      {
        "id": 4,
        "title": "API Tokens Used",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(api_tokens_used[5m])",
            "legendFormat": "{{model}}"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "token/s"
          }
        }
      },
      {
        "id": 5,
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "process_resident_memory_bytes",
            "legendFormat": "Memory"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "bytes"
          }
        }
      },
      {
        "id": 6,
        "title": "CPU Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(process_cpu_seconds_total[5m]) * 100",
            "legendFormat": "CPU"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent"
          }
        }
      }
    ]
  }
}
```

### 2. Alerting Configuration

#### Alert Rules

```yaml
# alert-rules.yml
groups:
  - name: ai-api-proxy
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.route }}"
          description: "Error rate is {{ $value }} errors per second"

      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time on {{ $labels.route }}"
          description: "95th percentile response time is {{ $value }} seconds"

      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes / 1024 / 1024 > 500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }} MB"

      - alert: RateLimitExceeded
        expr: rate(http_requests_total{status_code="429"}[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Rate limit exceeded"
          description: "Rate limit exceeded {{ $value }} times per second"

      - alert: AuthenticationFailures
        expr: rate(authentication_failures_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High authentication failure rate"
          description: "Authentication failure rate is {{ $value }} per second"
```

### 3. Log Aggregation

#### ELK Stack Setup

```bash
# Filebeat configuration
cat > filebeat.yml << EOF
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/ai-proxy/*.log
  json.keys_under_root: true
  json.add_error_key: true
  json.message_key: message

output.elasticsearch:
  hosts: ["elasticsearch:9200"]

setup.kibana:
  host: "kibana:5601"

processors:
  - add_docker_metadata:
      host: "unix:///var/run/docker.sock"
EOF
```

## Performance Optimization

### 1. Caching Strategy

#### Redis Caching

```javascript
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

// Cache middleware
const cache = (duration) => {
  return async (req, res, next) => {
    const key = `cache:${req.method}:${req.url}:${JSON.stringify(req.body)}`;
    
    try {
      const cached = await client.get(key);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
      
      res.originalJson = res.json;
      res.json = (body) => {
        client.setex(key, duration, JSON.stringify(body));
        res.originalJson(body);
      };
      
      next();
    } catch (error) {
      next();
    }
  };
};

// Usage
app.post('/v1/chat/completions', cache(300), chatCompletionHandler);
```

### 2. Connection Pooling

#### Database Connection Pooling

```javascript
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Health check
pool.query('SELECT 1')
  .then(() => console.log('Database connected'))
  .catch(err => console.error('Database connection error:', err));
```

### 3. Load Balancing

#### Nginx Load Balancer

```nginx
upstream ai_proxy {
    least_conn;
    server proxy1:8080 weight=3 max_fails=3 fail_timeout=30s;
    server proxy2:8080 weight=3 max_fails=3 fail_timeout=30s;
    server proxy3:8080 weight=2 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://ai_proxy;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Health check
        proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
    }
}
```

## Security Monitoring

### 1. Security Audit Logging

```javascript
const securityAuditLogger = require('./security-audit-logger');

// Security middleware
app.use((req, res, next) => {
  const originalEnd = res.end;
  
  res.end = function(chunk, encoding) {
    // Log security events
    if (res.statusCode === 401) {
      securityAuditLogger.log('authentication_failure', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        timestamp: new Date().toISOString()
      });
    }
    
    if (res.statusCode === 429) {
      securityAuditLogger.log('rate_limit_exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        timestamp: new Date().toISOString()
      });
    }
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
});
```

### 2. Intrusion Detection

```javascript
const rateLimit = require('express-rate-limit');

// Security-focused rate limiting
const securityRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    securityAuditLogger.log('security_rate_limit', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      timestamp: new Date().toISOString()
    });
    res.status(429).json({
      error: 'Too many requests',
      message: 'Security rate limit exceeded'
    });
  }
});

// Apply to all routes
app.use(securityRateLimit);
```

## Backup and Recovery

### 1. Automated Backup Script

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Create backup directory
mkdir -p $BACKUP_DIR/$DATE

# Backup configuration files
cp .env $BACKUP_DIR/$DATE/
cp users.json $BACKUP_DIR/$DATE/
cp providers.json $BACKUP_DIR/$DATE/

# Backup logs
tar -czf $BACKUP_DIR/$DATE/logs.tar.gz -C logs .

# Backup database (if applicable)
if [ -n "$DATABASE_URL" ]; then
  pg_dump $DATABASE_URL > $BACKUP_DIR/$DATE/database.sql
fi

# Compress backup
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz -C $BACKUP_DIR $DATE

# Clean old backups
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $BACKUP_DIR/backup_$DATE.tar.gz"
```

### 2. Backup Verification

```javascript
// Backup verification script
const fs = require('fs');
const path = require('path');

async function verifyBackup(backupPath) {
  try {
    // Check if backup file exists
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }

    // Extract and verify files
    const files = ['users.json', 'providers.json', '.env'];
    
    for (const file of files) {
      const filePath = path.join(backupPath, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing file in backup: ${file}`);
      }
      
      // Validate JSON files
      if (file.endsWith('.json')) {
        const content = fs.readFileSync(filePath, 'utf8');
        JSON.parse(content);
      }
    }

    console.log('Backup verification successful');
    return true;
  } catch (error) {
    console.error('Backup verification failed:', error.message);
    return false;
  }
}
```

### 3. Disaster Recovery Plan

```bash
#!/bin/bash
# disaster-recovery.sh

BACKUP_FILE=$1
ENVIRONMENT=$2

if [ -z "$BACKUP_FILE" ] || [ -z "$ENVIRONMENT" ]; then
  echo "Usage: $0 <backup-file> <environment>"
  exit 1
fi

# Stop current services
echo "Stopping current services..."
docker-compose down

# Extract backup
echo "Extracting backup..."
tar -xzf $BACKUP_FILE

# Restore configuration
echo "Restoring configuration..."
cp users.json /app/users.json
cp providers.json /app/providers.json
cp .env /app/.env

# Start services
echo "Starting services..."
docker-compose up -d

# Verify deployment
echo "Verifying deployment..."
sleep 30
curl -f http://localhost:8080/health || exit 1

echo "Disaster recovery completed successfully"
```

## Regular Maintenance Tasks

### 1. Daily Tasks

```bash
#!/bin/bash
# daily-maintenance.sh

# Rotate logs
logrotate -f /etc/logrotate.d/ai-api-proxy

# Clean temporary files
find /tmp -name "ai-proxy-*" -mtime +1 -delete

# Check disk space
df -h | grep -E "Filesystem|/var/log"

# Check service status
systemctl status ai-api-proxy

# Generate daily report
node scripts/daily-report.js
```

### 2. Weekly Tasks

```bash
#!/bin/bash
# weekly-maintenance.sh

# Update dependencies
npm update

# Security scan
npm audit

# Database optimization (if applicable)
psql $DATABASE_URL -c "VACUUM ANALYZE;"

# Check for security updates
apt list --upgradable 2>/dev/null | wc -l

# Generate weekly report
node scripts/weekly-report.js
```

### 3. Monthly Tasks

```bash
#!/bin/bash
# monthly-maintenance.sh

# Full system backup
./backup.sh

# Performance analysis
node scripts/performance-analysis.js

# Security audit
node scripts/security-audit.js

# Update system packages
sudo apt update && sudo apt upgrade -y

# Generate monthly report
node scripts/monthly-report.js
```

## Monitoring Dashboard

### 1. Key Metrics to Monitor

| Metric | Description | Target | Alert Threshold |
|--------|-------------|---------|-----------------|
| Response Time | Average API response time | < 1s | > 2s |
| Error Rate | Percentage of failed requests | < 1% | > 5% |
| Throughput | Requests per second | > 100 req/s | < 50 req/s |
| Memory Usage | RAM usage percentage | < 70% | > 85% |
| CPU Usage | CPU usage percentage | < 50% | > 80% |
| Active Users | Number of active API users | > 10 | < 5 |
| Token Usage | Daily token consumption | < 1M tokens | > 900K tokens |

### 2. Performance Baselines

```javascript
// Performance baseline configuration
const performanceBaselines = {
  responseTime: {
    p50: { target: 500, warning: 1000, critical: 2000 },
    p95: { target: 1000, warning: 2000, critical: 5000 },
    p99: { target: 2000, warning: 5000, critical: 10000 }
  },
  throughput: {
    min: 50,
    target: 100,
    max: 500
  },
  errorRate: {
    target: 0.01,
    warning: 0.05,
    critical: 0.10
  },
  resourceUsage: {
    memory: { target: 0.7, warning: 0.85, critical: 0.95 },
    cpu: { target: 0.5, warning: 0.8, critical: 0.9 }
  }
};
```

## Troubleshooting Common Issues

### 1. Performance Degradation

```bash
# Check system resources
top -p $(pgrep -f "node index.js")

# Check database queries
psql $DATABASE_URL -c "SELECT query, calls, total_time, mean_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Check network connections
netstat -an | grep :8080 | wc -l

# Check memory usage
node --inspect index.js
```

### 2. Memory Leaks

```javascript
// Memory leak detection
const heapdump = require('heapdump');

// Generate heap dump on error
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  heapdump.writeSnapshot((err, filename) => {
    console.log('Heap dump written to', filename);
  });
  process.exit(1);
});

// Monitor memory usage
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  console.log('Memory Usage:', {
    rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
    external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB'
  });
}, 60000);
```

### 3. Database Issues

```bash
# Check database connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Check database locks
psql $DATABASE_URL -c "SELECT blocked_locks.pid AS blocked_pid,
                       blocked_activity.usename AS blocked_user,
                       blocking_locks.pid AS blocking_pid,
                       blocking_activity.usename AS blocking_user,
                       blocked_activity.query AS blocked_statement,
                       blocking_activity.query AS current_statement_in_blocking_process
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.DATABASE IS NOT DISTINCT FROM blocked_locks.DATABASE
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.GRANTED;"
```

## Production Deployment Checklist

### Pre-Deployment
- [ ] Configure monitoring and logging
- [ ] Set up backup and recovery procedures
- [ ] Configure security settings
- [ ] Test performance baselines
- [ ] Set up alerting and notifications

### Post-Deployment
- [ ] Monitor system health and performance
- [ ] Verify backup procedures work
- [ ] Test disaster recovery plan
- [ ] Review security audit logs
- [ ] Update documentation

### Ongoing Maintenance
- [ ] Regular security updates
- [ ] Performance optimization
- [ ] Log rotation and cleanup
- [ ] Database maintenance
- [ ] Security audits

## Next Steps

1. Set up monitoring infrastructure (Prometheus, Grafana)
2. Configure logging and log aggregation
3. Implement backup and recovery procedures
4. Set up alerting and notifications
5. Create maintenance schedules
6. Test disaster recovery plan

For more information about deployment, see the [Deployment Guides](./deployment/) directory.