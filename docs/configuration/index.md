# Configuration Reference

This section provides comprehensive documentation for all AFMTS configuration options, environment variables, and settings.

## Configuration Overview

AFMTS supports multiple configuration methods:

1. **Environment Variables** - Recommended for production
2. **Configuration Files** - JSON/YAML files for structured config
3. **Database Storage** - Runtime configuration updates
4. **Command Line Arguments** - Development overrides

## Environment Variables

### Core Application Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Application environment |
| `PORT` | `3000` | HTTP server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `LOG_LEVEL` | `info` | Logging level (error, warn, info, debug) |
| `LOG_FILE` | `logs/afmts.log` | Log file path |
| `LOG_MAX_SIZE` | `10m` | Maximum log file size |
| `LOG_MAX_FILES` | `5` | Maximum number of log files |

### Database Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection string |
| `DB_HOST` | `localhost` | Database host |
| `DB_PORT` | `5432` | Database port |
| `DB_NAME` | `afmts` | Database name |
| `DB_USER` | `afmts_user` | Database username |
| `DB_PASSWORD` | - | Database password |
| `DB_SSL` | `false` | Enable SSL connection |
| `DB_MAX_CONNECTIONS` | `20` | Maximum database connections |
| `DB_IDLE_TIMEOUT` | `30000` | Connection idle timeout (ms) |

### Redis Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | - | Redis connection string |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | - | Redis password |
| `REDIS_DB` | `0` | Redis database number |
| `REDIS_TLS` | `false` | Enable TLS for Redis |

### Security Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | - | JWT signing secret (required) |
| `JWT_EXPIRES_IN` | `1h` | JWT token expiration |
| `API_KEY_SALT` | - | Salt for API key encryption |
| `BCRYPT_ROUNDS` | `12` | bcrypt hashing rounds |
| `SESSION_SECRET` | - | Session cookie secret |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed CORS origins |

### Provider Configuration

#### OpenAI Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `PROVIDER_OPENAI_API_KEY` | - | OpenAI API key |
| `PROVIDER_OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI API base URL |
| `PROVIDER_OPENAI_MODELS_ENDPOINT` | `/v1/models` | Models endpoint |
| `PROVIDER_OPENAI_RATE_LIMIT` | `60` | Requests per minute |
| `PROVIDER_OPENAI_TIMEOUT` | `30000` | Request timeout (ms) |
| `PROVIDER_OPENAI_ENABLED` | `true` | Enable provider |

#### Anthropic Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `PROVIDER_ANTHROPIC_API_KEY` | - | Anthropic API key |
| `PROVIDER_ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Anthropic API base URL |
| `PROVIDER_ANTHROPIC_MODELS_ENDPOINT` | `/v1/models` | Models endpoint |
| `PROVIDER_ANTHROPIC_RATE_LIMIT` | `50` | Requests per minute |
| `PROVIDER_ANTHROPIC_TIMEOUT` | `30000` | Request timeout (ms) |
| `PROVIDER_ANTHROPIC_ENABLED` | `true` | Enable provider |

#### HuggingFace Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `PROVIDER_HUGGINGFACE_API_KEY` | - | HuggingFace API key |
| `PROVIDER_HUGGINGFACE_BASE_URL` | `https://huggingface.co/api` | HuggingFace API base URL |
| `PROVIDER_HUGGINGFACE_MODELS_ENDPOINT` | `/models` | Models endpoint |
| `PROVIDER_HUGGINGFACE_RATE_LIMIT` | `100` | Requests per minute |
| `PROVIDER_HUGGINGFACE_TIMEOUT` | `30000` | Request timeout (ms) |
| `PROVIDER_HUGGINGFACE_ENABLED` | `true` | Enable provider |

### Monitoring Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_MONITORING` | `true` | Enable system monitoring |
| `MONITORING_INTERVAL` | `30000` | Health check interval (ms) |
| `HEALTH_CHECK_TIMEOUT` | `10000` | Health check timeout (ms) |
| `METRICS_RETENTION` | `30` | Metrics retention days |
| `ALERT_EMAIL` | - | Alert notification email |
| `SLACK_WEBHOOK` | - | Slack alert webhook URL |

### Cache Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_TTL` | `3600000` | Cache TTL in milliseconds |
| `CACHE_MAX_MEMORY` | `512mb` | Maximum cache memory |
| `CACHE_CHECK_PERIOD` | `60000` | Cache cleanup interval |
| `REDIS_CACHE_PREFIX` | `afmts:` | Redis cache key prefix |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW` | `900000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `1000` | Max requests per window |
| `RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS` | `false` | Skip successful requests |
| `RATE_LIMIT_SKIP_FAILED_REQUESTS` | `false` | Skip failed requests |

### Analytics Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANALYTICS_ENABLED` | `true` | Enable usage analytics |
| `ANALYTICS_RETENTION` | `90` | Analytics data retention (days) |
| `COST_ANALYSIS_ENABLED` | `true` | Enable cost analysis |
| `FORECASTING_ENABLED` | `true` | Enable usage forecasting |
| `REPORTING_INTERVAL` | `86400000` | Report generation interval (ms) |

### Backup Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_ENABLED` | `true` | Enable automated backups |
| `BACKUP_INTERVAL` | `86400000` | Backup interval (ms) |
| `BACKUP_RETENTION` | `7` | Backup retention days |
| `BACKUP_PATH` | `./backups` | Backup storage path |
| `BACKUP_COMPRESSION` | `true` | Compress backups |

### Dashboard Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_ENABLED` | `true` | Enable monitoring dashboard |
| `DASHBOARD_PORT` | `3001` | Dashboard port |
| `DASHBOARD_AUTH` | `true` | Require authentication |
| `DASHBOARD_USERNAME` | `admin` | Dashboard username |
| `DASHBOARD_PASSWORD` | - | Dashboard password |

## Configuration Files

### JSON Configuration File

Create `config/production.json`:

```json
{
  "app": {
    "port": 3000,
    "host": "0.0.0.0",
    "env": "production"
  },
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "afmts",
    "user": "afmts_user",
    "password": "secure-password",
    "ssl": true,
    "maxConnections": 20
  },
  "redis": {
    "host": "localhost",
    "port": 6379,
    "password": "redis-password",
    "db": 0
  },
  "security": {
    "jwtSecret": "your-jwt-secret",
    "jwtExpiresIn": "1h",
    "apiKeySalt": "your-api-key-salt",
    "bcryptRounds": 12
  },
  "providers": {
    "openai": {
      "apiKey": "sk-your-openai-key",
      "baseUrl": "https://api.openai.com/v1",
      "rateLimit": 60,
      "timeout": 30000,
      "enabled": true
    },
    "anthropic": {
      "apiKey": "sk-ant-your-anthropic-key",
      "baseUrl": "https://api.anthropic.com",
      "rateLimit": 50,
      "timeout": 30000,
      "enabled": true
    }
  },
  "monitoring": {
    "enabled": true,
    "interval": 30000,
    "timeout": 10000,
    "alertEmail": "alerts@yourcompany.com"
  },
  "cache": {
    "ttl": 3600000,
    "maxMemory": "512mb",
    "checkPeriod": 60000
  },
  "rateLimit": {
    "windowMs": 900000,
    "maxRequests": 1000
  },
  "analytics": {
    "enabled": true,
    "retention": 90,
    "reportingInterval": 86400000
  },
  "backup": {
    "enabled": true,
    "interval": 86400000,
    "retention": 7,
    "path": "./backups"
  }
}
```

### YAML Configuration File

Create `config/production.yaml`:

```yaml
app:
  port: 3000
  host: "0.0.0.0"
  env: "production"

database:
  host: "localhost"
  port: 5432
  name: "afmts"
  user: "afmts_user"
  password: "secure-password"
  ssl: true
  maxConnections: 20

redis:
  host: "localhost"
  port: 6379
  password: "redis-password"
  db: 0

security:
  jwtSecret: "your-jwt-secret"
  jwtExpiresIn: "1h"
  apiKeySalt: "your-api-key-salt"
  bcryptRounds: 12

providers:
  openai:
    apiKey: "sk-your-openai-key"
    baseUrl: "https://api.openai.com/v1"
    rateLimit: 60
    timeout: 30000
    enabled: true
  anthropic:
    apiKey: "sk-ant-your-anthropic-key"
    baseUrl: "https://api.anthropic.com"
    rateLimit: 50
    timeout: 30000
    enabled: true

monitoring:
  enabled: true
  interval: 30000
  timeout: 10000
  alertEmail: "alerts@yourcompany.com"

cache:
  ttl: 3600000
  maxMemory: "512mb"
  checkPeriod: 60000

rateLimit:
  windowMs: 900000
  maxRequests: 1000

analytics:
  enabled: true
  retention: 90
  reportingInterval: 86400000

backup:
  enabled: true
  interval: 86400000
  retention: 7
  path: "./backups"
```

## Database Schema

### Core Tables

#### providers

```sql
CREATE TABLE providers (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    api_key_encrypted TEXT,
    base_url VARCHAR(255) NOT NULL,
    models_endpoint VARCHAR(255),
    rate_limit INTEGER DEFAULT 60,
    timeout INTEGER DEFAULT 30000,
    enabled BOOLEAN DEFAULT true,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### models

```sql
CREATE TABLE models (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER REFERENCES providers(id),
    model_id VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    type VARCHAR(50) DEFAULT 'chat',
    free_tier BOOLEAN DEFAULT false,
    context_window INTEGER,
    pricing JSONB DEFAULT '{}',
    config JSONB DEFAULT '{}',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, model_id)
);
```

#### requests

```sql
CREATE TABLE requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    provider_id INTEGER REFERENCES providers(id),
    model_id INTEGER REFERENCES models(id),
    request_type VARCHAR(50) DEFAULT 'chat',
    tokens_prompt INTEGER DEFAULT 0,
    tokens_completion INTEGER DEFAULT 0,
    tokens_total INTEGER DEFAULT 0,
    cost DECIMAL(10,6) DEFAULT 0,
    response_time INTEGER,
    status_code INTEGER,
    error_message TEXT,
    client_ip INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### users

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    api_key_hash VARCHAR(255),
    rate_limit_override INTEGER,
    enabled BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### analytics

```sql
CREATE TABLE analytics (
    id SERIAL PRIMARY KEY,
    metric_type VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    value DECIMAL(15,6),
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

```sql
-- Performance indexes
CREATE INDEX idx_requests_created_at ON requests(created_at);
CREATE INDEX idx_requests_user_id ON requests(user_id);
CREATE INDEX idx_requests_provider_id ON requests(provider_id);
CREATE INDEX idx_requests_model_id ON requests(model_id);
CREATE INDEX idx_models_provider_id ON models(provider_id);
CREATE INDEX idx_analytics_timestamp ON analytics(timestamp);
CREATE INDEX idx_analytics_metric_type ON analytics(metric_type);

-- Composite indexes
CREATE INDEX idx_requests_user_date ON requests(user_id, DATE(created_at));
CREATE INDEX idx_requests_provider_date ON requests(provider_id, DATE(created_at));
CREATE INDEX idx_analytics_type_date ON analytics(metric_type, DATE(timestamp));
```

### Views

#### usage_summary

```sql
CREATE VIEW usage_summary AS
SELECT
    DATE(created_at) as date,
    COUNT(*) as total_requests,
    COUNT(DISTINCT user_id) as unique_users,
    SUM(tokens_total) as total_tokens,
    SUM(cost) as total_cost,
    AVG(response_time) as avg_response_time,
    SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
FROM requests
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

#### provider_performance

```sql
CREATE VIEW provider_performance AS
SELECT
    p.name as provider_name,
    COUNT(r.id) as total_requests,
    AVG(r.response_time) as avg_response_time,
    SUM(r.tokens_total) as total_tokens,
    SUM(r.cost) as total_cost,
    SUM(CASE WHEN r.status_code >= 400 THEN 1 ELSE 0 END) as error_count,
    ROUND(
        SUM(CASE WHEN r.status_code >= 400 THEN 1 ELSE 0 END)::decimal /
        COUNT(r.id)::decimal * 100, 2
    ) as error_rate
FROM providers p
LEFT JOIN requests r ON p.id = r.provider_id
WHERE r.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY p.id, p.name
ORDER BY total_requests DESC;
```

## Provider Configuration Formats

### CSV Format

**File**: `providers.csv`

```csv
provider,name,api_key,base_url,models_endpoint,rate_limit,timeout,enabled,config
openai,OpenAI,sk-your-key,https://api.openai.com/v1,/v1/models,60,30000,true,"{""organization"":""org-id""}"
anthropic,Anthropic,sk-ant-your-key,https://api.anthropic.com,/v1/models,50,30000,true,"{""version"":""2023-06-01""}"
huggingface,HuggingFace,hf_your-key,https://huggingface.co/api,/models,100,30000,true,"{}"
```

### JSON Format

**File**: `providers.json`

```json
{
  "openai": {
    "name": "OpenAI",
    "apiKey": "sk-your-key",
    "baseUrl": "https://api.openai.com/v1",
    "modelsEndpoint": "/v1/models",
    "rateLimit": 60,
    "timeout": 30000,
    "enabled": true,
    "config": {
      "organization": "org-id"
    }
  },
  "anthropic": {
    "name": "Anthropic",
    "apiKey": "sk-ant-your-key",
    "baseUrl": "https://api.anthropic.com",
    "modelsEndpoint": "/v1/models",
    "rateLimit": 50,
    "timeout": 30000,
    "enabled": true,
    "config": {
      "version": "2023-06-01"
    }
  }
}
```

## Configuration Validation

### Schema Validation

AFMTS uses Joi for configuration validation:

```javascript
const configSchema = Joi.object({
  app: Joi.object({
    port: Joi.number().integer().min(1).max(65535).default(3000),
    host: Joi.string().default('0.0.0.0'),
    env: Joi.string().valid('development', 'production', 'test').default('development')
  }),
  database: Joi.object({
    host: Joi.string().required(),
    port: Joi.number().integer().min(1).max(65535).default(5432),
    name: Joi.string().required(),
    user: Joi.string().required(),
    password: Joi.string().required(),
    ssl: Joi.boolean().default(false),
    maxConnections: Joi.number().integer().min(1).max(100).default(20)
  }),
  providers: Joi.object().pattern(
    Joi.string(),
    Joi.object({
      apiKey: Joi.string().required(),
      baseUrl: Joi.string().uri().required(),
      rateLimit: Joi.number().integer().min(1).max(1000).default(60),
      timeout: Joi.number().integer().min(1000).max(300000).default(30000),
      enabled: Joi.boolean().default(true)
    })
  )
});
```

### Runtime Validation

Configuration is validated at startup:

```javascript
const { error, value } = configSchema.validate(config);
if (error) {
  console.error('Configuration validation failed:', error.details);
  process.exit(1);
}
```

## Configuration Management

### Hot Reloading

Configuration can be reloaded without restart:

```bash
# Send SIGHUP to reload configuration
kill -HUP $(pgrep -f "node.*index.js")

# Or use the API
curl -X POST http://localhost:3000/api/config/reload \
  -H "Authorization: Bearer $TOKEN"
```

### Configuration Backup

Automatic configuration backup:

```bash
# Backup current configuration
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
cp providers.csv providers.csv.backup.$(date +%Y%m%d_%H%M%S)
```

### Environment-Specific Configuration

Use different configurations per environment:

```bash
# Development
cp config/development.json config/active.json

# Production
cp config/production.json config/active.json

# Test
cp config/test.json config/active.json
```

## Security Considerations

### Secret Management

1. **Never commit secrets** to version control
2. **Use environment variables** for sensitive data
3. **Encrypt API keys** in database storage
4. **Rotate secrets** regularly

### Access Control

1. **File permissions**: Restrict config file access
2. **Environment isolation**: Separate configs per environment
3. **Audit logging**: Track configuration changes

### Best Practices

```bash
# Secure file permissions
chmod 600 .env
chmod 600 providers.csv

# Use secret management tools
# export DATABASE_PASSWORD=$(vault kv get -field=password secret/database)

# Validate configuration before deployment
npm run validate-config
```

## Troubleshooting

### Common Configuration Issues

**Database Connection Failed**:
```bash
# Check environment variables
echo $DATABASE_URL

# Test connection
psql "$DATABASE_URL" -c "SELECT version();"
```

**Provider API Key Invalid**:
```bash
# Validate API key format
node -e "console.log(process.env.PROVIDER_OPENAI_API_KEY.startsWith('sk-'))"

# Test API connectivity
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     https://api.openai.com/v1/models
```

**Configuration Not Loading**:
```bash
# Check file permissions
ls -la .env

# Validate JSON syntax
node -e "console.log(JSON.parse(require('fs').readFileSync('config/production.json', 'utf8')))"
```

### Diagnostic Commands

**Show Current Configuration**:
```bash
curl http://localhost:3000/api/config \
  -H "Authorization: Bearer $TOKEN"
```

**Validate Configuration**:
```bash
npm run validate-config
```

**Test Provider Connections**:
```bash
npm run test-providers
```

---

**Next**: Learn about [Development Guide](../development/index.md)