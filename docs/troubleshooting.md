# Troubleshooting Guide

This guide provides solutions to common issues encountered when deploying and operating the AI API Proxy Server as a public server. Follow these steps to diagnose and resolve problems efficiently.

## Table of Contents

- [Quick Start](#quick-start)
- [Common Issues](#common-issues)
- [Performance Issues](#performance-issues)
- [Security Issues](#security-issues)
- [Provider Issues](#provider-issues)
- [Deployment Issues](#deployment-issues)
- [Monitoring and Logging](#monitoring-and-logging)
- [Debug Mode](#debug-mode)
- [Emergency Procedures](#emergency-procedures)

## Quick Start

### Basic Troubleshooting Steps

1. **Check server status**
   ```bash
   curl http://localhost:8080/health
   ```

2. **Check logs**
   ```bash
   tail -f logs/combined.log
   ```

3. **Check environment variables**
   ```bash
   echo $NODE_ENV
   echo $PORT
   ```

4. **Check dependencies**
   ```bash
   npm ls
   ```

## Common Issues

### 1. Server Won't Start

#### Problem
Server fails to start with no error messages.

#### Solution

**Check Node.js version:**
```bash
node -v  # Should be v16.0.0 or higher
```

**Check port availability:**
```bash
netstat -tulpn | grep :8080
lsof -i :8080
```

**Check dependencies:**
```bash
npm ci --only=production
```

**Check environment file:**
```bash
cat .env
```

**Manual start with debug output:**
```bash
npm start 2>&1 | tee debug.log
```

#### Example Error Resolution

```bash
# If you see "Error: Cannot find module 'express'"
npm ci --only=production

# If you see "EADDRINUSE: address already in use"
lsof -i :8080
kill -9 <PID>
```

### 2. Authentication Issues

#### Problem
API requests return 401 Unauthorized errors.

#### Solution

**Check API key format:**
```bash
echo "sk-demo1234567890" | grep -E '^sk-[a-zA-Z0-9_-]{32}$'
```

**Verify user configuration:**
```bash
cat users.json | jq '.users'
```

**Check API key in headers:**
```bash
curl -H "Authorization: Bearer sk-demo1234567890" http://localhost:8080/v1/models
```

**Generate new API key:**
```bash
node -e "console.log('sk-' + require('crypto').randomBytes(24).toString('hex'))"
```

#### Common Authentication Errors

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "Invalid API key provided"
  }
}
```

**Resolution:**
1. Verify API key format
2. Check if key exists in users.json
3. Ensure key is not expired
4. Check for typos in Authorization header

### 3. Rate Limit Issues

#### Problem
Requests return 429 Too Many Requests errors.

#### Solution

**Check rate limit configuration:**
```bash
echo $ENABLE_RATE_LIMITING
echo $RATE_LIMIT_WINDOW_MS
echo $RATE_LIMIT_MAX_REQUESTS
```

**Check current rate limit status:**
```bash
curl -H "Authorization: Bearer your_api_key" -I http://localhost:8080/v1/models
```

**Look for rate limit headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

**Temporarily disable rate limiting (for testing):**
```bash
export ENABLE_RATE_LIMITING=false
npm start
```

#### Rate Limit Debugging

```javascript
// Add to your application for debugging
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
    console.log('Rate limit headers:', {
      limit: res.get('X-RateLimit-Limit'),
      remaining: res.get('X-RateLimit-Remaining'),
      reset: res.get('X-RateLimit-Reset')
    });
  });
  
  next();
});
```

### 4. Configuration Issues

#### Problem
Server starts but doesn't work as expected.

#### Solution

**Check configuration files:**
```bash
# Check providers.json
cat providers.json | jq '.endpoints'

# Check users.json
cat users.json | jq '.users'

# Check security configuration
cat security-config.json | jq '.'
```

**Validate JSON syntax:**
```bash
cat providers.json | jq . || echo "Invalid JSON"
```

**Check environment variables:**
```bash
env | grep -E "(NODE_ENV|PORT|ADMIN_API_KEY)"
```

**Reset configuration:**
```bash
cp providers.json.backup providers.json
cp users.json.backup users.json
```

## Performance Issues

### 1. Slow Response Times

#### Problem
API responses are slower than expected.

#### Solution

**Check system resources:**
```bash
top -p $(pgrep -f "node index.js")
htop
```

**Check database queries (if applicable):**
```bash
psql $DATABASE_URL -c "SELECT query, calls, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

**Check network latency:**
```bash
ping google.com
curl -o /dev/null -s -w '%{time_total}\n' http://localhost:8080/health
```

**Enable performance logging:**
```javascript
// Add to your application
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) { // Log slow requests
      console.log(`Slow request: ${req.method} ${req.url} - ${duration}ms`);
    }
  });
  
  next();
});
```

### 2. Memory Issues

#### Problem
High memory usage or crashes due to memory leaks.

#### Solution

**Check memory usage:**
```bash
node --inspect index.js
# Then open Chrome DevTools -> chrome://inspect

# Or use process monitoring
ps -o pid,ppid,cmd,%mem,%cpu --sort=-%mem | head -10
```

**Generate heap dump:**
```bash
# Install heapdump first
npm install heapdump

# In your application
const heapdump = require('heapdump');
heapdump.writeSnapshot((err, filename) => {
  console.log('Heap dump written to', filename);
});
```

**Check for memory leaks:**
```javascript
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

**Optimize memory usage:**
```javascript
// Enable garbage collection hints
global.gc = require('gc-stats').gc;

// Call garbage collection manually if needed
if (global.gc) {
  global.gc();
}
```

### 3. High CPU Usage

#### Problem
CPU usage is consistently high.

#### Solution

**Check CPU usage:**
```bash
top -p $(pgrep -f "node index.js")
htop
```

**Profile CPU usage:**
```bash
# Install node-inspector
npm install -g node-inspector

# Start with inspector
node-debug index.js
```

**Check for infinite loops:**
```javascript
// Add timeout protection
const timeout = require('connect-timeout');

app.use(timeout('30s'));

app.use((req, res, next) => {
  if (!req.timedout) {
    next();
  }
});
```

## Security Issues

### 1. Authentication Failures

#### Problem
Multiple authentication failures from suspicious IPs.

#### Solution

**Check authentication logs:**
```bash
grep "authentication_failure" logs/combined.log
grep "invalid_api_key" logs/combined.log
```

**Block suspicious IPs:**
```bash
# Using iptables
iptables -A INPUT -s 192.168.1.100 -j DROP

# Using UFW
sudo ufw deny from 192.168.1.100
```

**Enable enhanced authentication:**
```bash
export ENABLE_ENHANCED_AUTH=true
export ENABLE_RATE_LIMITING=true
export RATE_LIMIT_MAX_REQUESTS=50
```

### 2. Rate Limit Bypass

#### Problem
Users are bypassing rate limits.

#### Solution

**Check rate limit configuration:**
```bash
echo $ENABLE_RATE_LIMITING
echo $RATE_LIMIT_WINDOW_MS
echo $RATE_LIMIT_MAX_REQUESTS
```

**Implement IP-based rate limiting:**
```javascript
const rateLimit = require('express-rate-limit');

const ipRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use(ipRateLimit);
```

**Check for proxy usage:**
```javascript
app.use((req, res, next) => {
  console.log('IP:', req.ip);
  console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);
  console.log('X-Real-IP:', req.headers['x-real-ip']);
  next();
});
```

### 3. Security Vulnerabilities

#### Problem
Security vulnerabilities detected.

#### Solution

**Run security audit:**
```bash
npm audit
npm audit fix
```

**Check for known vulnerabilities:**
```bash
npm outdated
```

**Update dependencies:**
```bash
npm update
```

**Check security configuration:**
```bash
cat security-config.json | jq '.'
```

## Provider Issues

### 1. Provider Connection Failures

#### Problem
Requests to AI providers are failing.

#### Solution

**Check provider configuration:**
```bash
cat providers.json | jq '.endpoints'
```

**Test provider connectivity:**
```bash
curl -I https://openrouter.ai/api/v1/models
curl -I https://text.pollinations.ai/
```

**Check provider status:**
```bash
curl http://localhost:8080/health | jq '.checks.providers'
```

**Add provider fallback:**
```javascript
// In your provider configuration
{
  "models": {
    "gpt-3.5-turbo": [
      {
        "provider_name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "api_key": process.env.API_KEY_OPENROUTER,
        "priority": 1
      },
      {
        "provider_name": "Pollinations",
        "base_url": "https://text.pollinations.ai/",
        "api_key": "",
        "priority": 2
      }
    ]
  }
}
```

### 2. Provider Rate Limits

#### Problem
AI providers are returning rate limit errors.

#### Solution

**Check provider rate limits:**
```bash
# Check provider documentation
curl -H "Authorization: Bearer your_api_key" http://localhost:8080/v1/models
```

**Implement request queuing:**
```javascript
const { Queue } = require('bull');

const requestQueue = new Queue('api-requests');

// Process queue
requestQueue.process(async (job) => {
  const { apiKey, endpoint, data } = job.data;
  // Make API request
  return result;
});

// Add to queue
requestQueue.add('api-request', {
  apiKey: 'sk-demo1234567890',
  endpoint: '/v1/chat/completions',
  data: { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'Hello' }] }
});
```

**Implement exponential backoff:**
```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429) {
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
      } else {
        throw error;
      }
    }
  }
}
```

### 3. Provider API Key Issues

#### Problem
Provider API keys are invalid or expired.

#### Solution

**Check API keys:**
```bash
echo $API_KEY_OPENROUTER
echo $API_KEY_POLLINATIONS
```

**Test API keys:**
```bash
curl -H "Authorization: Bearer $API_KEY_OPENROUTER" https://openrouter.ai/api/v1/models
```

**Rotate API keys:**
```bash
# Generate new key
NEW_KEY=$(node -e "console.log('sk-' + require('crypto').randomBytes(24).toString('hex'))")
echo "New API key: $NEW_KEY"
```

**Update provider configuration:**
```javascript
// Update providers.json with new keys
const fs = require('fs');
const providers = JSON.parse(fs.readFileSync('providers.json', 'utf8'));

providers.endpoints['/v1/chat/completions'].models['gpt-3.5-turbo'][0].api_key = NEW_KEY;

fs.writeFileSync('providers.json', JSON.stringify(providers, null, 2));
```

## Deployment Issues

### 1. Docker Issues

#### Problem
Docker container won't start or has issues.

#### Solution

**Check container logs:**
```bash
docker logs ai-proxy
docker logs -f ai-proxy
```

**Check container status:**
```bash
docker ps
docker inspect ai-proxy
```

**Check Dockerfile:**
```bash
cat Dockerfile
```

**Rebuild container:**
```bash
docker build -t ai-api-proxy .
docker run -d --name ai-proxy ai-api-proxy
```

**Check volume mounts:**
```bash
docker run -v $(pwd)/config:/app/config -v $(pwd)/logs:/app/logs ai-api-proxy
```

### 2. Cloud Deployment Issues

#### Problem
Application doesn't work on cloud platforms.

#### Solution

**Check cloud logs:**
```bash
# AWS
aws logs tail /aws/elasticbeanstalk/your-app-name/var/log/nodejs/nodejs.log

# Google Cloud
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=ai-proxy"

# Azure
az webapp log tail --name your-app-name --resource-group your-rg
```

**Check environment variables:**
```bash
# AWS
aws elasticbeanstalk describe-configuration-settings --application-name your-app --environment-name your-env

# Google Cloud
gcloud run services describe ai-proxy --region us-central1 --format=json | jq '.spec.template.spec.containers[0].env'

# Azure
az webapp config appsettings list --name your-app-name --resource-group your-rg
```

**Check deployment status:**
```bash
# AWS
aws elasticbeanstalk describe-environments --application-name your-app

# Google Cloud
gcloud run services list --region us-central1

# Azure
az webapp deployment list --name your-app-name --resource-group your-rg --query "[].properties.timestamp" --output table
```

### 3. SSL/TLS Issues

#### Problem
SSL certificate issues or HTTPS not working.

#### Solution

**Check certificate:**
```bash
openssl s_client -connect your-domain.com:443 -servername your-domain.com
```

**Check certificate expiration:**
```bash
echo | openssl s_client -connect your-domain.com:443 2>/dev/null | openssl x509 -noout -dates
```

**Test HTTPS endpoint:**
```bash
curl -I https://your-domain.com/health
curl -k https://your-domain.com/health
```

**Check Nginx configuration:**
```bash
nginx -t
sudo systemctl reload nginx
```

## Monitoring and Logging

### 1. Log Analysis

#### Problem
Need to analyze logs for troubleshooting.

#### Solution

**Search for specific errors:**
```bash
grep "ERROR" logs/combined.log
grep "429" logs/combined.log
grep "401" logs/combined.log
```

**Filter by IP address:**
```bash
grep "192.168.1.100" logs/combined.log
```

**Filter by time range:**
```bash
grep "2024-01-01" logs/combined.log
```

**Analyze request patterns:**
```bash
awk '{print $7}' logs/combined.log | sort | uniq -c | sort -nr
```

### 2. Performance Monitoring

#### Problem
Need to monitor performance metrics.

#### Solution

**Check Prometheus metrics:**
```bash
curl http://localhost:8080/metrics
```

**Check Grafana dashboard:**
```bash
# Access Grafana at http://your-grafana-domain.com
# Check dashboards for AI API Proxy
```

**Set up custom metrics:**
```javascript
const promClient = require('prom-client');

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// Track request duration
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    httpRequestDuration.observe(
      { method: req.method, route: req.route?.path || 'unknown', status_code: res.statusCode },
      duration / 1000
    );
  });
  
  next();
});
```

### 3. Alerting Setup

#### Problem
Need to set up alerts for critical issues.

#### Solution

**Configure email alerts:**
```javascript
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendAlert(subject, message) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: subject,
    text: message
  });
}
```

**Set up health check alerts:**
```javascript
// Check health every 5 minutes
setInterval(async () => {
  try {
    const response = await fetch('http://localhost:8080/health');
    const health = await response.json();
    
    if (health.status !== 'healthy') {
      await sendAlert('Health Check Failed', JSON.stringify(health, null, 2));
    }
  } catch (error) {
    await sendAlert('Health Check Error', error.message);
  }
}, 5 * 60 * 1000);
```

## Debug Mode

### 1. Enable Debug Mode

#### Solution

**Set debug environment variables:**
```bash
export LOG_LEVEL=debug
export NODE_ENV=development
export ENABLE_DEBUG_MODE=true
```

**Start with debug output:**
```bash
npm run dev
```

**Enable verbose logging:**
```javascript
// In your application
const winston = require('winston');

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'debug.log' })
  ]
});
```

### 2. Debug Tools

#### Solution

**Node.js Inspector:**
```bash
node --inspect index.js
# Open Chrome DevTools -> chrome://inspect
```

**Debug specific modules:**
```bash
node --inspect --trace-warnings --trace-deprecation index.js
```

**Debug memory issues:**
```bash
node --inspect --expose-gc index.js
# In DevTools, run gc() manually
```

**Debug network issues:**
```javascript
const { createProxyMiddleware } = require('http-proxy-middleware');

app.use('/debug', (req, res, next) => {
  console.log('Debug request:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body
  });
  next();
});
```

## Emergency Procedures

### 1. Emergency Stop

#### Problem
Need to immediately stop the server due to critical issues.

#### Solution

**Graceful shutdown:**
```bash
# Send SIGTERM
kill -TERM $(pgrep -f "node index.js")

# Or use PM2
pm2 stop all
pm2 kill
```

**Force stop:**
```bash
# Send SIGKILL
kill -KILL $(pgrep -f "node index.js")
```

**Docker emergency stop:**
```bash
docker stop ai-proxy
docker rm ai-proxy
```

### 2. Emergency Rollback

#### Problem
Need to rollback to previous working version.

#### Solution

**Git rollback:**
```bash
# Get previous commit
git log --oneline -5

# Reset to previous commit
git reset --hard HEAD~1

# Restart service
npm start
```

**Backup rollback:**
```bash
# Restore from backup
cp backup/previous-version/providers.json providers.json
cp backup/previous-version/users.json users.json

# Restart service
npm start
```

**Docker rollback:**
```bash
# Rollback to previous image
docker tag ai-api-proxy:latest ai-api-proxy:broken
docker tag ai-api-proxy:previous ai-api-proxy:latest

# Restart container
docker restart ai-proxy
```

### 3. Emergency Maintenance Mode

#### Problem
Need to put server into maintenance mode.

#### Solution

**Enable maintenance mode:**
```javascript
// Add middleware for maintenance mode
app.use((req, res, next) => {
  if (process.env.MAINTENANCE_MODE === 'true') {
    return res.status(503).json({
      error: {
        code: 'maintenance_mode',
        message: 'Server is under maintenance. Please try again later.'
      }
    });
  }
  next();
});
```

**Set maintenance mode:**
```bash
export MAINTENANCE_MODE=true
```

**Custom maintenance page:**
```javascript
app.use(express.static('public'));

app.get('/maintenance', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>Server Maintenance</h1>
        <p>We are performing scheduled maintenance. Please check back later.</p>
        <p>Estimated downtime: 30 minutes</p>
      </body>
    </html>
  `);
});
```

## Support and Resources

### 1. Getting Help

**Check existing documentation:**
- [Public Server Setup Guide](./public-server-setup.md)
- [Deployment Guides](./deployment/)
- [API Documentation](./api/public-api-documentation.md)
- [Monitoring and Maintenance](./monitoring-maintenance.md)

**Community support:**
- GitHub Issues: Report bugs and request features
- Discussions: Share tips and best practices
- Wiki: Community-contributed examples

### 2. Professional Support

For enterprise customers and critical issues, contact support for dedicated assistance.

### 3. Debug Information

When reporting issues, include the following information:

```bash
# System information
uname -a
node -v
npm -v

# Application information
cat package.json
cat .env

# Recent logs
tail -50 logs/combined.log
tail -50 logs/error.log

# Health check
curl -s http://localhost:8080/health | jq .

# Metrics
curl -s http://localhost:8080/metrics | head -20
```

## Prevention Checklist

### Regular Maintenance

- [ ] Update dependencies regularly
- [ ] Monitor system resources
- [ ] Check log files for errors
- [ ] Verify backup procedures
- [ ] Test disaster recovery plan

### Security Checks

- [ ] Run security audits
- [ ] Update SSL certificates
- [ ] Check for authentication failures
- [ ] Monitor rate limiting
- [ ] Review access logs

### Performance Optimization

- [ ] Monitor response times
- [ ] Check memory usage
- [ ] Optimize database queries
- [ ] Review caching strategies
- [ ] Load test regularly

## Next Steps

1. **Identify the specific issue** you're experiencing
2. **Follow the troubleshooting steps** for that issue
3. **Check the logs** for detailed error information
4. **Implement the recommended solution**
5. **Monitor the system** to ensure the issue is resolved
6. **Document the solution** for future reference

For more information about deployment and configuration, see the [Public Server Setup Guide](./public-server-setup.md).