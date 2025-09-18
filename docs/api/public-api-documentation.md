# Public API Documentation

This document provides comprehensive API documentation for consumers of the AI API Proxy Server. The proxy server provides a unified interface to multiple AI providers with enhanced security, rate limiting, and monitoring.

## Base URL

```
https://your-domain.com
```

## Authentication

All API requests require authentication using an API key. Include your API key in the Authorization header:

```
Authorization: Bearer your_api_key_here
```

### API Key Format

API keys follow the format: `sk-xxxxxxxxxxxxxxxxxxxxxxxx`

### Getting an API Key

API keys are automatically generated when you make your first authenticated request. The key is returned in the response header:

```
X-API-Key: sk-demo1234567890
```

## Rate Limiting

The API implements rate limiting based on your plan:

| Plan | Requests per 15 minutes | Tokens per day |
|------|----------------------|---------------|
| Free | 50 | 10,000 |
| 500k | 100 | 500,000 |
| Unlimited | 500 | No limit |

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Error Handling

The API uses standard HTTP status codes and returns error details in JSON format:

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "Invalid API key provided",
    "type": "authentication_error"
  }
}
```

### Common Error Codes

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 400 | `invalid_request` | The request was invalid |
| 401 | `invalid_api_key` | Invalid or missing API key |
| 403 | `forbidden` | Access denied |
| 429 | `rate_limit_exceeded` | Rate limit exceeded |
| 500 | `server_error` | Internal server error |
| 502 | `bad_gateway` | Upstream provider error |
| 503 | `service_unavailable` | Service temporarily unavailable |

## API Endpoints

### 1. Models

#### List Available Models

Retrieve a list of available models from all configured providers.

**Endpoint:** `GET /v1/models`

**Headers:**
```
Authorization: Bearer your_api_key
```

**Response:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-3.5-turbo",
      "object": "model",
      "created": 1677610602,
      "owned_by": "openai",
      "provider": "OpenRouter",
      "provider_id": "openai/gpt-3.5-turbo",
      "pricing": {
        "input_tokens": 0.0015,
        "output_tokens": 0.002
      }
    },
    {
      "id": "gpt-4",
      "object": "model",
      "created": 1677610602,
      "owned_by": "openai",
      "provider": "OpenRouter",
      "provider_id": "openai/gpt-4",
      "pricing": {
        "input_tokens": 0.03,
        "output_tokens": 0.06
      }
    },
    {
      "id": "flux-schnell",
      "object": "model",
      "created": 1677610602,
      "owned_by": "pollinations",
      "provider": "Pollinations",
      "provider_id": "pollinations/flux-schnell",
      "pricing": {
        "input_tokens": 0,
        "output_tokens": 0
      }
    }
  ]
}
```

### 2. Chat Completions

Generate chat completions using various AI models.

**Endpoint:** `POST /v1/chat/completions`

**Headers:**
```
Authorization: Bearer your_api_key
Content-Type: application/json
```

**Request Body:**
```json
{
  "model": "gpt-3.5-turbo",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Hello! How are you?"
    }
  ],
  "max_tokens": 150,
  "temperature": 0.7,
  "top_p": 1.0,
  "frequency_penalty": 0,
  "presence_penalty": 0,
  "stream": false
}
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `model` | string | Yes | - | Model ID to use for completion |
| `messages` | array | Yes | - | Array of message objects |
| `max_tokens` | integer | No | 150 | Maximum number of tokens to generate |
| `temperature` | number | No | 0.7 | Sampling temperature (0.0 to 2.0) |
| `top_p` | number | No | 1.0 | Nucleus sampling parameter |
| `frequency_penalty` | number | No | 0 | Frequency penalty (-2.0 to 2.0) |
| `presence_penalty` | number | No | 0 | Presence penalty (-2.0 to 2.0) |
| `stream` | boolean | No | false | Whether to stream responses |
| `stop` | string or array | No | - | Up to 4 sequences where the API will stop generating tokens |

**Response:**
```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1677610602,
  "model": "gpt-3.5-turbo",
  "provider": "OpenRouter",
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
    "prompt_tokens": 20,
    "completion_tokens": 15,
    "total_tokens": 35
  }
}
```

**Streaming Response:**
```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion.chunk",
  "created": 1677610602,
  "model": "gpt-3.5-turbo",
  "provider": "OpenRouter",
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

### 3. Image Generation

Generate images using AI models.

**Endpoint:** `POST /v1/images/generations`

**Headers:**
```
Authorization: Bearer your_api_key
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "A beautiful sunset over mountains",
  "model": "flux-schnell",
  "size": "1024x1024",
  "quality": "standard",
  "n": 1,
  "response_format": "url"
}
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Text description of the image |
| `model` | string | Yes | - | Model ID for image generation |
| `size` | string | No | "1024x1024" | Image size (1024x1024, 1792x1024, 1024x1792) |
| `quality` | string | No | "standard" | Image quality (standard, hd) |
| `n` | integer | No | 1 | Number of images to generate |
| `response_format` | string | No | "url" | Response format (url, b64_json) |

**Response:**
```json
{
  "created": 1677610602,
  "data": [
    {
      "url": "https://image.pollinations.ai/prompt/A%20beautiful%20sunset%20over%20mountains",
      "revised_prompt": "A beautiful sunset over mountains with vibrant colors"
    }
  ]
}
```

### 4. Usage Statistics

Get usage statistics for your API key.

**Endpoint:** `GET /v1/usage`

**Headers:**
```
Authorization: Bearer your_api_key
```

**Response:**
```json
{
  "object": "usage",
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "usage": {
    "total_tokens": 125000,
    "total_requests": 450,
    "by_model": {
      "gpt-3.5-turbo": {
        "tokens": 80000,
        "requests": 300
      },
      "gpt-4": {
        "tokens": 45000,
        "requests": 150
      }
    },
    "by_day": [
      {
        "date": "2024-01-01",
        "tokens": 5000,
        "requests": 20
      },
      {
        "date": "2024-01-02",
        "tokens": 4500,
        "requests": 18
      }
    ]
  },
  "limits": {
    "daily_tokens": 500000,
    "daily_requests": 1000,
    "remaining_tokens": 375000,
    "remaining_requests": 550
  }
}
```

### 5. Health Check

Check the health status of the API server.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "version": "1.0.0",
  "uptime": 86400,
  "checks": {
    "database": {
      "status": "healthy"
    },
    "providers": {
      "status": "healthy",
      "available": ["OpenRouter", "Pollinations", "GitHub Models"]
    },
    "rate_limit": {
      "status": "healthy",
      "current": 45,
      "max": 100
    }
  }
}
```

## Webhooks

### 1. Webhook Configuration

Set up webhooks to receive notifications about API usage and events.

**Endpoint:** `POST /v1/webhooks`

**Headers:**
```
Authorization: Bearer your_api_key
Content-Type: application/json
```

**Request Body:**
```json
{
  "url": "https://your-domain.com/webhook",
  "events": ["usage_alert", "rate_limit_exceeded", "error"],
  "secret": "your_webhook_secret"
}
```

### 2. Webhook Events

#### Usage Alert

```json
{
  "event": "usage_alert",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "api_key": "sk-demo1234567890",
    "current_usage": 450000,
    "limit": 500000,
    "percentage": 90
  }
}
```

#### Rate Limit Exceeded

```json
{
  "event": "rate_limit_exceeded",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "api_key": "sk-demo1234567890",
    "endpoint": "/v1/chat/completions",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

## SDKs and Libraries

### JavaScript/Node.js

```javascript
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: 'your_api_key',
  baseURL: 'https://your-domain.com'
});

// Chat completion
async function chatCompletion() {
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'user', content: 'Hello!' }
    ]
  });
  
  console.log(completion.choices[0].message.content);
}

// List models
async function listModels() {
  const models = await openai.models.list();
  console.log(models.data);
}

// Generate image
async function generateImage() {
  const image = await openai.images.generate({
    model: 'flux-schnell',
    prompt: 'A beautiful sunset'
  });
  
  console.log(image.data[0].url);
}
```

### Python

```python
import openai

# Configure client
client = openai.OpenAI(
    api_key="your_api_key",
    base_url="https://your-domain.com"
)

# Chat completion
def chat_completion():
    completion = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "user", "content": "Hello!"}
        ]
    )
    print(completion.choices[0].message.content)

# List models
def list_models():
    models = client.models.list()
    for model in models:
        print(f"{model.id} - {model.provider}")

# Generate image
def generate_image():
    image = client.images.generate(
        model="flux-schnell",
        prompt="A beautiful sunset"
    )
    print(image.data[0].url)
```

### cURL Examples

#### Chat Completion

```bash
curl -X POST "https://your-domain.com/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

#### List Models

```bash
curl -X GET "https://your-domain.com/v1/models" \
  -H "Authorization: Bearer your_api_key"
```

#### Generate Image

```bash
curl -X POST "https://your-domain.com/v1/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "model": "flux-schnell",
    "prompt": "A beautiful sunset",
    "size": "1024x1024"
  }'
```

## Best Practices

### 1. Error Handling

```javascript
// Example error handling
try {
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: "Hello!" }]
  });
  
  console.log(response.choices[0].message.content);
} catch (error) {
  if (error.status === 429) {
    console.log('Rate limit exceeded. Please wait before making more requests.');
  } else if (error.status === 401) {
    console.log('Invalid API key. Please check your credentials.');
  } else {
    console.error('API Error:', error.message);
  }
}
```

### 2. Rate Limiting

```javascript
// Simple rate limiting implementation
const rateLimit = {
  requests: [],
  maxRequests: 100,
  windowMs: 15 * 60 * 1000 // 15 minutes
};

function checkRateLimit() {
  const now = Date.now();
  rateLimit.requests = rateLimit.requests.filter(time => now - time < rateLimit.windowMs);
  
  if (rateLimit.requests.length >= rateLimit.maxRequests) {
    throw new Error('Rate limit exceeded');
  }
  
  rateLimit.requests.push(now);
}

// Usage
try {
  checkRateLimit();
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: "Hello!" }]
  });
} catch (error) {
  if (error.message === 'Rate limit exceeded') {
    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Retry logic here
  }
}
```

### 3. Streaming

```javascript
// Handle streaming responses
async function streamChat() {
  const stream = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: "Tell me a story" }],
    stream: true
  });
  
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      process.stdout.write(content);
    }
  }
  
  console.log(); // New line at the end
}
```

### 4. Retry Logic

```javascript
// Exponential backoff retry
async function retryWithBackoff(fn, maxRetries = 3) {
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      retryCount++;
      
      if (retryCount >= maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Usage
try {
  const response = await retryWithBackoff(() => 
    openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello!" }]
    })
  );
} catch (error) {
  console.error('Failed after retries:', error);
}
```

## Webhooks Implementation

### 1. Webhook Verification

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${digest}`)
  );
}

// Usage
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  if (verifyWebhookSignature(payload, signature, process.env.WEBHOOK_SECRET)) {
    // Process webhook
    console.log('Webhook verified:', req.body);
    res.status(200).send('OK');
  } else {
    res.status(401).send('Invalid signature');
  }
});
```

### 2. Webhook Handler

```javascript
app.post('/webhook', (req, res) => {
  const { event, data } = req.body;
  
  switch (event) {
    case 'usage_alert':
      handleUsageAlert(data);
      break;
    case 'rate_limit_exceeded':
      handleRateLimitExceeded(data);
      break;
    case 'error':
      handleError(data);
      break;
    default:
      console.log('Unknown event:', event);
  }
  
  res.status(200).send('OK');
});

function handleUsageAlert(data) {
  console.log('Usage alert:', data);
  // Send email, Slack notification, etc.
}

function handleRateLimitExceeded(data) {
  console.log('Rate limit exceeded:', data);
  // Log and alert
}

function handleError(data) {
  console.error('API Error:', data);
  // Log error and notify
}
```

## Migration from OpenAI

### 1. Basic Migration

```javascript
// From OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// To AI API Proxy
const openai = new OpenAI({
  apiKey: process.env.YOUR_API_KEY,
  baseURL: 'https://your-domain.com'
});
```

### 2. Advanced Migration

```javascript
// Enhanced configuration
const openai = new OpenAI({
  apiKey: process.env.YOUR_API_KEY,
  baseURL: 'https://your-domain.com',
  defaultHeaders: {
    'X-Custom-Header': 'value'
  }
});

// Custom timeout
const openai = new OpenAI({
  apiKey: process.env.YOUR_API_KEY,
  baseURL: 'https://your-domain.com',
  timeout: 30000 // 30 seconds
});
```

## Support and Resources

### 1. Documentation

- [API Error Handling](./errors.md)
- [Security Best Practices](../security/best-practices.md)
- [Deployment Guides](../deployment/)
- [Monitoring and Maintenance](../monitoring-maintenance.md)

### 2. Community Support

- GitHub Issues: Report bugs and request features
- Discussions: Share tips and best practices
- Wiki: Community-contributed examples

### 3. Professional Support

For enterprise customers and custom integrations, contact support for dedicated assistance.

## Changelog

### Version 1.0.0 (2024-01-01)
- Initial release
- Support for chat completions
- Support for image generation
- Basic authentication and rate limiting

### Version 1.1.0 (2024-01-15)
- Added webhook support
- Enhanced error handling
- Improved rate limiting
- Added usage statistics

### Version 1.2.0 (2024-02-01)
- Added streaming support
- Enhanced monitoring
- Improved security features
- Added provider management

## Next Steps

1. **Get your API key** by making your first request
2. **Review the available models** to choose the right one for your use case
3. **Implement proper error handling** in your application
4. **Set up monitoring** to track your usage
5. **Configure webhooks** for real-time notifications

For more information about server setup and deployment, see the [Public Server Setup Guide](../public-server-setup.md).