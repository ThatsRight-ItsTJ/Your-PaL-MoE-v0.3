# Docker Deployment Guide

This guide covers deploying the AI API Proxy Server using Docker containers. Docker provides a consistent, portable, and scalable deployment environment.

## Prerequisites

- Docker (version 20.10 or higher)
- Docker Compose (version 1.29 or higher)
- Git

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-repo/Your-PaL-MoE-v0.3.git
cd Your-PaL-MoE-v0.3
```

### 2. Build and Run

```bash
# Build the Docker image
docker build -t ai-api-proxy .

# Run the container
docker run -d \
  --name ai-proxy \
  -p 8080:8080 \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/users.json:/app/users.json \
  -v $(pwd)/providers.json:/app/providers.json \
  --env-file .env \
  ai-api-proxy
```

### 3. Verify Deployment

```bash
# Check container status
docker ps

# Test the API
curl http://localhost:8080/health

# View logs
docker logs ai-proxy
```

## Docker Compose Deployment

### 1. Create Docker Compose File

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  ai-api-proxy:
    build: .
    container_name: ai-api-proxy
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - PORT=8080
      - HOST=0.0.0.0
      - ADMIN_API_KEY=${ADMIN_API_KEY}
      - ENABLE_RATE_LIMITING=true
      - RATE_LIMIT_WINDOW_MS=900000
      - RATE_LIMIT_MAX_REQUESTS=100
      - ENABLE_REQUEST_LOGGING=true
      - USE_ENV_KEYS=${USE_ENV_KEYS:-false}
    volumes:
      - ./config:/app/config
      - ./logs:/app/logs
      - ./users.json:/app/users.json
      - ./providers.json:/app/providers.json
      - ./.env:/app/.env:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - ai-proxy-network

  nginx:
    image: nginx:alpine
    container_name: ai-proxy-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - ai-api-proxy
    networks:
      - ai-proxy-network

networks:
  ai-proxy-network:
    driver: bridge
```

### 2. Create Nginx Configuration

Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream ai_proxy {
        server ai-api-proxy:8080;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    server {
        listen 80;
        server_name your-domain.com;

        # SSL termination
        location / {
            return 301 https://$server_name$request_uri;
        }
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # SSL configuration
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # Proxy configuration
        location / {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass http://ai_proxy;
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
            
            # CORS headers
            add_header Access-Control-Allow-Origin *;
            add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
            add_header Access-Control-Allow-Headers "Content-Type, Authorization";
        }

        # Health check endpoint
        location /health {
            proxy_pass http://ai_proxy/health;
            proxy_set_header Host $host;
        }
    }
}
```

### 3. Create Dockerfile

Create `Dockerfile`:

```dockerfile
# Multi-stage build for smaller image size
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p logs temp backups

# Set permissions
RUN chmod 755 logs temp backups

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Copy package files and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy application code
COPY --from=builder /app ./

# Create necessary directories
RUN mkdir -p logs temp backups

# Set permissions
RUN chmod 755 logs temp backups

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start the application
CMD ["npm", "start"]
```

### 4. Environment Configuration

Create `.env` file:

```bash
# Server Configuration
NODE_ENV=production
PORT=8080
HOST=0.0.0.0

# Security Settings
ADMIN_API_KEY=your_strong_admin_api_key_here
ENABLE_RATE_LIMITING=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
ENABLE_REQUEST_LOGGING=true

# Provider Configuration
USE_ENV_KEYS=false  # Set to true if using environment variables
```

### 5. Build and Deploy

```bash
# Build and start services
docker-compose up --build -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f ai-api-proxy

# Stop services
docker-compose down
```

## Advanced Docker Configuration

### 1. Multi-Environment Setup

Create `docker-compose.override.yml` for development:

```yaml
version: '3.8'

services:
  ai-api-proxy:
    environment:
      - NODE_ENV=development
      - LOG_LEVEL=debug
      - ENABLE_RATE_LIMITING=false
    volumes:
      - .:/app
      - /app/node_modules
    command: npm run dev
```

### 2. Scaling with Docker Swarm

```bash
# Initialize Docker Swarm
docker swarm init

# Create stack file
cat > docker-stack.yml << EOF
version: '3.8'

services:
  ai-api-proxy:
    image: ai-api-proxy:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
    environment:
      - NODE_ENV=production
      - PORT=8080
      - ADMIN_API_KEY=${ADMIN_API_KEY}
    ports:
      - "8080:8080"
    networks:
      - ai-proxy-network

networks:
  ai-proxy-network:
    driver: overlay
EOF

# Deploy stack
docker stack deploy -c docker-stack.yml ai-proxy-stack

# Check stack status
docker stack services ai-proxy-stack
```

### 3. Docker Secrets Management

```bash
# Create secrets
echo "your_admin_api_key" | docker secret create admin_api_key -
echo "your_openrouter_api_key" | docker secret create openrouter_api_key -

# Update docker-compose.yml to use secrets
services:
  ai-api-proxy:
    secrets:
      - admin_api_key
      - openrouter_api_key
    environment:
      - ADMIN_API_KEY_FILE=/run/secrets/admin_api_key
      - API_KEY_OPENROUTER_FILE=/run/secrets/openrouter_api_key

secrets:
  admin_api_key:
    external: true
  openrouter_api_key:
    external: true
```

## Monitoring and Logging

### 1. Docker Logging

```bash
# View container logs
docker logs ai-api-proxy
docker logs -f ai-api-proxy  # Follow logs

# View logs from specific time
docker logs --since 1h ai-api-proxy

# View logs with grep
docker logs ai-api-proxy | grep "ERROR"

# Configure log rotation
echo '{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}' | sudo tee /etc/docker/daemon.json
```

### 2. Prometheus Monitoring

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'ai-api-proxy'
    static_configs:
      - targets: ['ai-api-proxy:8080']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

Add to `docker-compose.yml`:

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
    networks:
      - ai-proxy-network

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    networks:
      - ai-proxy-network
```

### 3. Health Checks

The Docker image includes built-in health checks:

```bash
# Check container health
docker inspect ai-api-proxy --format='{{.State.Health.Status}}'

# Monitor health events
docker events ai-api-proxy --filter event=health_status
```

## Backup and Recovery

### 1. Backup Configuration

```bash
#!/bin/bash
# backup-docker.sh

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
docker exec ai-proxy tar -czf - -C /app \
  users.json \
  providers.json \
  config \
  logs | gzip > $BACKUP_DIR/backup_$DATE.tar.gz

# Clean old backups (keep last 7 days)
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/backup_$DATE.tar.gz"
```

### 2. Restore from Backup

```bash
#!/bin/bash
# restore-docker.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file>"
  exit 1
fi

# Stop container
docker stop ai-proxy

# Extract backup
gunzip -c $BACKUP_FILE | docker run --rm -i -v $(pwd)/app:/app alpine tar -xzf - -C /app

# Start container
docker start ai-proxy

echo "Restore completed"
```

## Security Hardening

### 1. Docker Security

```bash
# Run container as non-root user
docker run -u 1001:1001 ai-api-proxy

# Read-only root filesystem
docker run --read-only --tmpfs /tmp --tmpfs /app/node_modules ai-api-proxy

# Security options
docker run --security-opt no-new-privileges:true \
           --cap-drop ALL \
           --cap-add SETGID \
           --cap-add SETUID \
           ai-api-proxy
```

### 2. Network Security

```bash
# Create custom network
docker network create --driver bridge ai-proxy-network

# Restrict network access
docker run --network ai-proxy-network \
           --network-alias ai-proxy \
           ai-api-proxy
```

### 3. Resource Limits

```bash
# Set resource limits
docker run --memory=512m \
           --cpus=1.0 \
           --memory-swap=1g \
           ai-api-proxy
```

## Troubleshooting

### Common Issues

#### 1. Port Already in Use

```bash
# Find process using port
lsof -i :8080

# Kill process
kill -9 <PID>
```

#### 2. Container Won't Start

```bash
# Check container logs
docker logs ai-api-proxy

# Check container status
docker inspect ai-api-proxy --format='{{.State.Status}}'

# Restart container
docker restart ai-api-proxy
```

#### 3. Network Issues

```bash
# Check network connectivity
docker exec ai-api-proxy curl -I http://localhost:8080/health

# Check network configuration
docker network inspect ai-proxy-network
```

### Debug Mode

```bash
# Run container in debug mode
docker run -it --rm \
  -e LOG_LEVEL=debug \
  -e NODE_ENV=development \
  ai-api-proxy npm run dev
```

## Production Deployment Checklist

- [ ] Configure proper environment variables
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (Nginx)
- [ ] Set up monitoring and logging
- [ ] Configure backup and recovery
- [ ] Implement security hardening
- [ ] Set up resource limits
- [ ] Configure health checks
- [ ] Test deployment with sample requests
- [ ] Monitor performance and adjust as needed

## Next Steps

1. Deploy using Docker Compose for production
2. Set up monitoring and alerting
3. Configure SSL/TLS certificates
4. Set up backup and recovery procedures
5. Test scalability and performance

For more information about the AI API Proxy Server, see the main [Public Server Setup Guide](../public-server-setup.md).