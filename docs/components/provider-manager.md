# Provider Configuration Manager

The Provider Configuration Manager is responsible for managing provider settings, API keys, and connection configurations for all AI model providers supported by AFMTS.

## Overview

The Provider Configuration Manager handles the loading, validation, and management of provider configurations from multiple sources including CSV files, environment variables, and database storage.

## Key Features

- **Multi-Source Configuration**: Supports CSV files, environment variables, and database storage
- **Dynamic Loading**: Hot-reloading of configuration changes without restart
- **Validation**: Comprehensive validation of provider settings and API keys
- **Security**: Secure credential management and encryption
- **Normalization**: URL normalization and endpoint standardization

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CSV Loader    │    │   Env Loader    │    │   DB Loader     │
│                 │    │                 │    │                 │
│ • File parsing  │    │ • Env vars      │    │ • DB queries    │
│ • CSV validation│    │ • Key mapping   │    │ • Caching       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Validator     │
                    │                 │
                    │ • Schema val    │
                    │ • Key validation│
                    │ • URL normalization│
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Normalizer    │
                    │                 │
                    │ • URL formatting│
                    │ • Default values│
                    │ • Provider-specific│
                    └─────────────────┘
```

## Configuration Sources

### 1. CSV Configuration

**File Format**: `providers.csv`

```csv
provider,name,api_key,base_url,models_endpoint,rate_limit,timeout,enabled
openai,OpenAI,sk-your-key,https://api.openai.com/v1,/v1/models,60,30000,true
anthropic,Anthropic,sk-ant-your-key,https://api.anthropic.com,/v1/models,50,30000,true
huggingface,HuggingFace,hf_your-key,https://huggingface.co/api,/models,100,30000,true
```

**Field Descriptions**:
- `provider`: Unique provider identifier (lowercase)
- `name`: Human-readable provider name
- `api_key`: Provider API key (encrypted in storage)
- `base_url`: Base URL for API calls
- `models_endpoint`: Endpoint for model listing
- `rate_limit`: Requests per minute limit
- `timeout`: Request timeout in milliseconds
- `enabled`: Enable/disable provider

### 2. Environment Variables

**Pattern**: `PROVIDER_{PROVIDER_NAME}_{SETTING}`

```bash
# OpenAI Configuration
PROVIDER_OPENAI_API_KEY=sk-your-openai-key
PROVIDER_OPENAI_BASE_URL=https://api.openai.com/v1
PROVIDER_OPENAI_MODELS_ENDPOINT=/v1/models
PROVIDER_OPENAI_RATE_LIMIT=60
PROVIDER_OPENAI_TIMEOUT=30000
PROVIDER_OPENAI_ENABLED=true

# Anthropic Configuration
PROVIDER_ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
PROVIDER_ANTHROPIC_BASE_URL=https://api.anthropic.com
PROVIDER_ANTHROPIC_MODELS_ENDPOINT=/v1/models
PROVIDER_ANTHROPIC_RATE_LIMIT=50
PROVIDER_ANTHROPIC_TIMEOUT=30000
PROVIDER_ANTHROPIC_ENABLED=true
```

### 3. Database Storage

**Table**: `providers`

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Core Classes

### ProviderManager

**Location**: `config/provider-manager.js`

**Purpose**: Main coordinator for provider configuration management

**Key Methods**:
- `loadProviders()`: Load all provider configurations
- `getProvider(providerId)`: Get specific provider configuration
- `updateProvider(providerId, config)`: Update provider settings
- `validateProvider(config)`: Validate provider configuration
- `reloadConfiguration()`: Hot-reload configuration changes

**Usage**:
```javascript
const providerManager = new ProviderManager();

// Load all providers
await providerManager.loadProviders();

// Get OpenAI configuration
const openai = providerManager.getProvider('openai');
console.log(openai.base_url); // https://api.openai.com/v1
```

### ProviderLoader

**Location**: `config/provider-loader.js`

**Purpose**: Handles loading provider configurations from various sources

**Key Methods**:
- `loadFromCSV(filePath)`: Load from CSV file
- `loadFromEnv()`: Load from environment variables
- `loadFromDB()`: Load from database
- `mergeConfigurations(sources)`: Merge multiple configuration sources

### ProviderNormalizer

**Location**: `config/provider-normalizer.js`

**Purpose**: Normalizes and standardizes provider configurations

**Key Methods**:
- `normalizeURL(url)`: Normalize URLs with proper formatting
- `setDefaults(config)`: Apply default values
- `validateSchema(config)`: Validate configuration schema
- `normalizeProviderSpecific(config)`: Apply provider-specific normalization

**URL Normalization Examples**:
```javascript
// Input: "https://api.openai.com/v1/"
// Output: "https://api.openai.com/v1"

// Input: "api.openai.com/v1"
// Output: "https://api.openai.com/v1"

// Input: "https://api.anthropic.com"
// Output: "https://api.anthropic.com"
```

### ProviderValidator

**Location**: `config/provider-validator.js`

**Purpose**: Validates provider configurations and API keys

**Key Methods**:
- `validateAPIKey(key, provider)`: Validate API key format
- `validateURL(url)`: Validate URL format and accessibility
- `validateRateLimit(limit)`: Validate rate limit values
- `validateTimeout(timeout)`: Validate timeout values
- `testConnection(config)`: Test provider API connectivity

**Validation Rules**:
```javascript
const rules = {
    openai: {
        apiKeyPattern: /^sk-/,
        baseURL: /^https:\/\/api\.openai\.com/,
        modelsEndpoint: '/v1/models'
    },
    anthropic: {
        apiKeyPattern: /^sk-ant-/,
        baseURL: /^https:\/\/api\.anthropic\.com/,
        modelsEndpoint: '/v1/models'
    }
};
```

## Configuration Flow

### Loading Process

```
1. Load from CSV file (if exists)
2. Load from environment variables
3. Load from database (if configured)
4. Merge configurations (CSV takes precedence)
5. Validate merged configuration
6. Normalize URLs and apply defaults
7. Cache validated configuration
8. Return provider configurations
```

### Update Process

```
1. Receive configuration update
2. Validate new configuration
3. Normalize and apply defaults
4. Test provider connectivity (optional)
5. Update cache
6. Persist to database (if configured)
7. Notify dependent components
8. Log configuration change
```

## Security Features

### API Key Encryption

**Encryption Process**:
```javascript
const encrypted = await encrypt(apiKey, process.env.API_KEY_SALT);
const decrypted = await decrypt(encrypted, process.env.API_KEY_SALT);
```

**Storage**: API keys are encrypted before storage in database or cache

### Access Control

**Permission Levels**:
- `read`: View provider configurations (no API keys)
- `write`: Modify provider settings
- `admin`: Full access including API key management

### Audit Logging

**Logged Events**:
- Configuration changes
- API key updates
- Provider enable/disable
- Validation failures

## Error Handling

### Configuration Errors

**Common Errors**:
- Invalid CSV format
- Missing required fields
- Invalid API key format
- Unreachable provider URLs
- Rate limit violations

**Error Recovery**:
- Fallback to cached configuration
- Partial configuration loading
- Graceful degradation for invalid providers

### Validation Errors

**Validation Failures**:
```javascript
{
    "provider": "openai",
    "errors": [
        {
            "field": "api_key",
            "message": "API key must start with 'sk-'",
            "code": "INVALID_FORMAT"
        }
    ]
}
```

## Performance Optimization

### Caching Strategy

**Cache Layers**:
- **Memory Cache**: Fast in-memory storage for active configurations
- **Redis Cache**: Distributed cache for multi-instance deployments
- **Database Cache**: Persistent storage with periodic refresh

**Cache TTL**: 5 minutes for active configurations, 1 hour for static settings

### Lazy Loading

**On-Demand Loading**:
- Providers loaded only when requested
- Configuration validation performed asynchronously
- Connection testing deferred until first use

## Monitoring and Metrics

### Configuration Metrics

**Tracked Metrics**:
- Configuration load time
- Validation success/failure rates
- Provider connectivity status
- Configuration update frequency

### Health Checks

**Health Endpoints**:
```javascript
GET /health/providers
// Response
{
    "status": "healthy",
    "providers": {
        "openai": "healthy",
        "anthropic": "healthy",
        "huggingface": "unhealthy"
    },
    "last_updated": "2025-10-15T02:44:43.259Z"
}
```

## API Integration

### REST API Endpoints

**Provider Management**:
```
GET    /api/providers          # List all providers
GET    /api/providers/:id      # Get specific provider
POST   /api/providers          # Create new provider
PUT    /api/providers/:id      # Update provider
DELETE /api/providers/:id      # Delete provider
POST   /api/providers/reload   # Reload configuration
```

**Configuration Examples**:

**List Providers**:
```bash
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/providers
```

**Update Provider**:
```bash
curl -X PUT \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "rate_limit": 100,
       "timeout": 45000
     }' \
     http://localhost:3000/api/providers/openai
```

## Testing

### Unit Tests

**Test Coverage**:
- Configuration loading from all sources
- Validation logic for all providers
- Normalization functions
- Error handling scenarios
- Security features

**Test Files**:
- `tests/unit/provider-manager.test.js`
- `tests/unit/provider-loader.test.js`
- `tests/unit/provider-validator.test.js`

### Integration Tests

**Test Scenarios**:
- End-to-end configuration loading
- Provider API connectivity testing
- Configuration update workflows
- Multi-source configuration merging

## Troubleshooting

### Common Issues

**CSV Loading Errors**:
```
Error: Invalid CSV format
Solution: Check CSV headers and data format
```

**Environment Variable Issues**:
```
Error: PROVIDER_OPENAI_API_KEY not found
Solution: Check environment variable naming and values
```

**Database Connection Issues**:
```
Error: Database connection failed
Solution: Verify database credentials and connectivity
```

### Diagnostic Commands

**Check Configuration Status**:
```bash
curl http://localhost:3000/health/providers
```

**Validate Configuration**:
```bash
npm run validate-config
```

**Test Provider Connectivity**:
```bash
npm run test-providers
```

## Best Practices

### Configuration Management

1. **Use Environment Variables for Secrets**: Never store API keys in code or CSV files
2. **Validate Configurations**: Always validate before applying changes
3. **Backup Configurations**: Regular backups of provider settings
4. **Monitor Changes**: Log all configuration modifications

### Security Practices

1. **Encrypt Sensitive Data**: Always encrypt API keys in storage
2. **Rotate Keys Regularly**: Implement key rotation policies
3. **Limit Access**: Restrict configuration access to authorized users
4. **Audit Changes**: Maintain audit logs of all configuration changes

### Performance Optimization

1. **Cache Configurations**: Use appropriate cache TTL values
2. **Lazy Loading**: Load configurations on-demand
3. **Batch Updates**: Update multiple providers in single operation
4. **Monitor Performance**: Track configuration load times and cache hit rates

## Future Enhancements

### Planned Features

- **Dynamic Provider Discovery**: Auto-discovery of new providers
- **Configuration Templates**: Pre-defined configurations for common providers
- **Version Control**: Configuration versioning and rollback
- **Multi-Environment Support**: Environment-specific configurations

### Research Areas

- **Configuration as Code**: Infrastructure as code for provider configurations
- **AI-Powered Validation**: ML-based configuration validation
- **Real-time Synchronization**: Cross-region configuration synchronization

---

**Next**: Learn about the [Dynamic Model Parser](dynamic-parser.md) component.