# API Documentation

This section provides comprehensive documentation for the AFMTS REST API and WebSocket real-time streams.

## API Overview

The AFMTS API provides programmatic access to all system functionality including model routing, analytics, monitoring, and configuration management.

## Base URL

```
Production: https://your-afmts-instance.com/api
Development: http://localhost:3000/api
```

## Authentication

### JWT Authentication

All API endpoints require authentication using JWT tokens.

**Header Format**:
```
Authorization: Bearer <jwt_token>
```

**Token Generation**:
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}'
```

**Response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

## Rate Limiting

### Global Limits
- **Authenticated Requests**: 1000 requests per 15 minutes
- **Anonymous Requests**: 100 requests per hour
- **Burst Limit**: 50 requests per minute

### Rate Limit Headers
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1638360000
X-RateLimit-Retry-After: 60
```

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {
      "field": "model",
      "issue": "Model not found"
    }
  },
  "timestamp": "2025-10-15T02:45:10.077Z",
  "request_id": "req_1234567890"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `AUTHENTICATION_ERROR` | 401 | Invalid or missing authentication |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Internal server error |

## Core Endpoints

### Model Operations

#### POST /api/chat

Route requests to AI models with automatic provider selection.

**Request**:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "model": "auto",
  "temperature": 0.7,
  "max_tokens": 1000,
  "stream": false
}
```

**Parameters**:
- `messages` (required): Array of message objects
- `model` (optional): Specific model or "auto" for automatic selection
- `temperature` (optional): Sampling temperature (0.0-2.0)
- `max_tokens` (optional): Maximum tokens to generate
- `stream` (optional): Enable streaming response

**Response**:
```json
{
  "id": "chat_1234567890",
  "object": "chat.completion",
  "created": 1638360000,
  "model": "gpt-3.5-turbo",
  "provider": "openai",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! I'm doing well, thank you for asking. How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 13,
    "completion_tokens": 17,
    "total_tokens": 30
  }
}
```

#### GET /api/models

List all available models across all providers.

**Response**:
```json
{
  "models": [
    {
      "id": "gpt-3.5-turbo",
      "name": "GPT-3.5 Turbo",
      "provider": "openai",
      "type": "chat",
      "free_tier": true,
      "context_window": 4096,
      "pricing": {
        "input": 0.0015,
        "output": 0.002
      }
    },
    {
      "id": "claude-2",
      "name": "Claude 2",
      "provider": "anthropic",
      "type": "chat",
      "free_tier": false,
      "context_window": 100000,
      "pricing": {
        "input": 0.008,
        "output": 0.024
      }
    }
  ],
  "total": 25,
  "free_only": false
}
```

**Query Parameters**:
- `provider`: Filter by provider (e.g., "openai", "anthropic")
- `free_only`: Show only free-tier models (true/false)
- `type`: Filter by model type (e.g., "chat", "completion")

### Analytics Endpoints

#### GET /api/analytics/usage

Get usage statistics and analytics.

**Response**:
```json
{
  "period": {
    "start": "2025-10-01T00:00:00Z",
    "end": "2025-10-15T00:00:00Z"
  },
  "summary": {
    "total_requests": 15420,
    "total_tokens": 2847391,
    "total_cost": 45.67,
    "avg_response_time": 1250
  },
  "by_provider": [
    {
      "provider": "openai",
      "requests": 8920,
      "tokens": 1456789,
      "cost": 23.45,
      "avg_response_time": 1100
    },
    {
      "provider": "anthropic",
      "requests": 6500,
      "tokens": 1390602,
      "cost": 22.22,
      "avg_response_time": 1400
    }
  ],
  "by_model": [
    {
      "model": "gpt-3.5-turbo",
      "requests": 6543,
      "tokens": 987654,
      "cost": 15.67
    }
  ]
}
```

**Query Parameters**:
- `start_date`: Start date (ISO 8601)
- `end_date`: End date (ISO 8601)
- `provider`: Filter by provider
- `model`: Filter by model
- `group_by`: Grouping (hour/day/week/month)

#### GET /api/analytics/cost

Get detailed cost analysis and forecasting.

**Response**:
```json
{
  "current_period": {
    "start": "2025-10-01T00:00:00Z",
    "end": "2025-10-31T23:59:59Z",
    "cost": 145.67,
    "projected_cost": 187.34,
    "budget_remaining": 54.33
  },
  "trends": {
    "daily_average": 4.78,
    "weekly_change": 12.5,
    "monthly_projection": 187.34
  },
  "breakdown": {
    "by_provider": {
      "openai": 89.23,
      "anthropic": 56.44
    },
    "by_model": {
      "gpt-4": 67.89,
      "claude-2": 45.67
    }
  },
  "recommendations": [
    {
      "type": "cost_saving",
      "message": "Switch to GPT-3.5 Turbo for 40% cost reduction",
      "potential_savings": 23.45
    }
  ]
}
```

### Provider Management

#### GET /api/providers

List all configured providers.

**Response**:
```json
{
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "base_url": "https://api.openai.com/v1",
      "enabled": true,
      "health_status": "healthy",
      "rate_limit": 60,
      "models_count": 12,
      "last_health_check": "2025-10-15T02:45:10.077Z"
    },
    {
      "id": "anthropic",
      "name": "Anthropic",
      "base_url": "https://api.anthropic.com",
      "enabled": true,
      "health_status": "healthy",
      "rate_limit": 50,
      "models_count": 8,
      "last_health_check": "2025-10-15T02:45:10.077Z"
    }
  ]
}
```

#### POST /api/providers

Add a new provider configuration.

**Request**:
```json
{
  "provider": "custom-provider",
  "name": "Custom AI Provider",
  "api_key": "sk-custom-key",
  "base_url": "https://api.custom-provider.com/v1",
  "models_endpoint": "/models",
  "rate_limit": 100,
  "timeout": 30000,
  "enabled": true
}
```

#### PUT /api/providers/{provider_id}

Update provider configuration.

**Request**:
```json
{
  "rate_limit": 120,
  "timeout": 45000,
  "enabled": true
}
```

### Monitoring Endpoints

#### GET /api/health

Get system health status.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-15T02:45:10.077Z",
  "version": "0.3.0",
  "uptime": 345600,
  "services": {
    "database": {
      "status": "healthy",
      "response_time": 12
    },
    "redis": {
      "status": "healthy",
      "response_time": 5
    },
    "providers": {
      "status": "degraded",
      "details": {
        "openai": "unhealthy",
        "anthropic": "healthy"
      }
    }
  }
}
```

#### GET /api/metrics

Get detailed system metrics.

**Response**:
```json
{
  "system": {
    "cpu_usage": 45.2,
    "memory_usage": 67.8,
    "disk_usage": 23.1
  },
  "application": {
    "active_connections": 1250,
    "requests_per_second": 45.6,
    "average_response_time": 1250,
    "error_rate": 0.02
  },
  "cache": {
    "hit_rate": 94.5,
    "size": 23456789
  },
  "database": {
    "connections": 12,
    "query_time": 45,
    "connection_pool_usage": 75.0
  }
}
```

## WebSocket API

### Connection

Connect to WebSocket for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  console.log('Connected to AFMTS WebSocket');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### Authentication

Authenticate WebSocket connection:

```javascript
ws.send(JSON.stringify({
  type: 'auth',
  token: 'your-jwt-token'
}));
```

### Real-time Events

#### System Health Updates

```json
{
  "type": "health_update",
  "data": {
    "status": "healthy",
    "services": {
      "database": "healthy",
      "redis": "healthy"
    },
    "timestamp": "2025-10-15T02:45:10.077Z"
  }
}
```

#### Model Availability Changes

```json
{
  "type": "model_update",
  "data": {
    "provider": "openai",
    "model": "gpt-4",
    "status": "available",
    "free_tier": false,
    "timestamp": "2025-10-15T02:45:10.077Z"
  }
}
```

#### Usage Metrics

```json
{
  "type": "usage_update",
  "data": {
    "period": "minute",
    "metrics": {
      "requests": 45,
      "tokens": 12340,
      "cost": 0.23,
      "avg_response_time": 1200
    },
    "timestamp": "2025-10-15T02:45:10.077Z"
  }
}
```

#### Provider Health Alerts

```json
{
  "type": "alert",
  "data": {
    "level": "warning",
    "message": "Provider openai experiencing high latency",
    "details": {
      "provider": "openai",
      "avg_response_time": 5000,
      "error_rate": 0.15
    },
    "timestamp": "2025-10-15T02:45:10.077Z"
  }
}
```

### Subscription Management

Subscribe to specific event types:

```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  events: ['health_update', 'model_update', 'usage_update']
}));
```

Unsubscribe from events:

```javascript
ws.send(JSON.stringify({
  type: 'unsubscribe',
  events: ['usage_update']
}));
```

## Streaming API

### Server-Sent Events (SSE)

For real-time streaming of chat completions:

```javascript
const eventSource = new EventSource('/api/chat/stream?token=your-jwt-token');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.done) {
    eventSource.close();
  } else {
    console.log('Chunk:', data.content);
  }
};
```

### Streaming Response Format

```json
{
  "id": "chat_1234567890",
  "object": "chat.completion.chunk",
  "created": 1638360000,
  "model": "gpt-3.5-turbo",
  "provider": "openai",
  "choices": [
    {
      "index": 0,
      "delta": {
        "content": "Hello"
      },
      "finish_reason": null
    }
  ]
}
```

## SDK Examples

### JavaScript/Node.js

```javascript
const AFMTS = require('afmts-sdk');

const client = new AFMTS({
  baseURL: 'http://localhost:3000/api',
  token: 'your-jwt-token'
});

// Simple chat
const response = await client.chat({
  messages: [{ role: 'user', content: 'Hello!' }],
  model: 'auto'
});

console.log(response.choices[0].message.content);

// Streaming chat
const stream = await client.chat({
  messages: [{ role: 'user', content: 'Tell me a story' }],
  model: 'auto',
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
```

### Python

```python
import afmts

client = afmts.Client(
    base_url="http://localhost:3000/api",
    token="your-jwt-token"
)

# Simple chat
response = client.chat(
    messages=[{"role": "user", "content": "Hello!"}],
    model="auto"
)

print(response.choices[0].message.content)

# Streaming chat
stream = client.chat(
    messages=[{"role": "user", "content": "Tell me a story"}],
    model="auto",
    stream=True
)

for chunk in stream:
    print(chunk.content, end="")
```

### cURL Examples

**Simple Chat**:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}],
    "model": "auto"
  }'
```

**Get Models**:
```bash
curl -H "Authorization: Bearer your-jwt-token" \
     http://localhost:3000/api/models
```

**Get Analytics**:
```bash
curl -H "Authorization: Bearer your-jwt-token" \
     "http://localhost:3000/api/analytics/usage?start_date=2025-10-01&end_date=2025-10-15"
```

## API Versioning

The API uses semantic versioning:

- **v1** (Current): `/api/v1/` - Stable production API
- **Latest**: `/api/` - Points to current stable version

### Version Headers

```bash
curl -H "Accept-Version: v1" \
     -H "Authorization: Bearer your-token" \
     http://localhost:3000/api/models
```

## Pagination

List endpoints support pagination:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1250,
    "total_pages": 25,
    "has_next": true,
    "has_prev": false,
    "next_url": "/api/models?page=2&limit=50",
    "prev_url": null
  }
}
```

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 1000)

## Content Types

### Supported Content Types

- `application/json`: Default for all endpoints
- `application/x-www-form-urlencoded`: Alternative for simple requests
- `multipart/form-data`: For file uploads (future feature)

### Response Content Types

- `application/json`: All API responses
- `text/event-stream`: Server-sent events
- `application/octet-stream`: File downloads

## CORS Configuration

CORS is configured for web applications:

```javascript
// Allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'https://your-app.com',
  process.env.ALLOWED_ORIGINS?.split(',') || []
];

// Allowed headers
const allowedHeaders = [
  'Authorization',
  'Content-Type',
  'X-Requested-With',
  'Accept',
  'Origin'
];
```

## Security Features

### Input Validation

All inputs are validated using Joi schemas:

```javascript
const chatSchema = Joi.object({
  messages: Joi.array().items(
    Joi.object({
      role: Joi.string().valid('user', 'assistant', 'system').required(),
      content: Joi.string().max(100000).required()
    })
  ).min(1).required(),
  model: Joi.string().default('auto'),
  temperature: Joi.number().min(0).max(2).default(1),
  max_tokens: Joi.number().integer().min(1).max(4000).default(1000),
  stream: Joi.boolean().default(false)
});
```

### SQL Injection Prevention

All database queries use parameterized statements:

```javascript
const result = await db.query(
  'SELECT * FROM requests WHERE user_id = $1 AND created_at > $2',
  [userId, startDate]
);
```

### XSS Protection

Response data is sanitized:

```javascript
const sanitized = DOMPurify.sanitize(userInput);
```

## Performance Optimization

### Response Compression

All responses are compressed using gzip:

```javascript
app.use(compression({
  level: 6,
  threshold: 1024
}));
```

### Caching Headers

Appropriate cache headers are set:

```javascript
// No caching for dynamic content
res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

// Short cache for static model data
res.set('Cache-Control', 'public, max-age=300');
```

### Connection Pooling

Database connections are pooled:

```javascript
const pool = new Pool({
  max: 20,
  min: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

## Monitoring and Debugging

### Request Logging

All requests are logged with correlation IDs:

```json
{
  "timestamp": "2025-10-15T02:45:10.077Z",
  "level": "info",
  "message": "API request completed",
  "request_id": "req_1234567890",
  "method": "POST",
  "url": "/api/chat",
  "status_code": 200,
  "response_time": 1250,
  "user_agent": "AFMTS-SDK/1.0.0"
}
```

### Debug Mode

Enable debug logging:

```bash
export DEBUG=afmts:*
export LOG_LEVEL=debug
```

### Request Tracing

Distributed tracing with request IDs:

```javascript
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || generateId();
  res.set('x-request-id', req.id);
  next();
});
```

## Migration Guide

### From v0.x to v1.0

**Breaking Changes**:
1. Authentication now required for all endpoints
2. Rate limiting implemented
3. Response format standardized
4. Error codes updated

**Migration Steps**:
1. Update authentication headers
2. Handle rate limiting
3. Update error handling
4. Test all integrations

### Deprecation Notices

- `/api/v0/` endpoints deprecated, migrate to `/api/v1/`
- `model` parameter in responses changed to `provider_model_id`

## Support

### Getting Help

1. **Documentation**: Check this API reference first
2. **Issues**: Create GitHub issues for bugs
3. **Discussions**: Use GitHub discussions for questions
4. **Support**: Contact support@afmts.com for enterprise support

### API Status

Check API status: https://status.afmts.com

### Changelog

View API changes: `/api/changelog`

---

**Next**: Learn about [Deployment Guide](../deployment/index.md)