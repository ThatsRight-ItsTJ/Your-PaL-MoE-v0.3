# G4F Providers Usage Guide

This guide explains how to use the `g4f_providers_template.csv` file to configure and utilize various AI providers within their free plan limits.

## Overview

The `g4f_providers_template.csv` file contains configuration information for multiple AI providers that can be used with the G4F (Great Free AI) framework. Each provider has different rate limits, costs, and requirements that you need to understand to use them effectively.

## File Structure

The CSV file contains the following columns:

| Column | Description |
|--------|-------------|
| `Name` | Provider identifier name |
| `Base_URL` | Base API endpoint URL |
| `APIKey` | API key placeholder (replace with your actual key) |
| `Model(s) list endpoint` | URL to get available models |
| `Rate Limit/cost info` | Usage limits and costs |
| `Notes` | Additional information about the provider |

## Provider Categories

### 1. No-Authentication Providers
These providers can be used without API keys but have stricter rate limits.

#### NoAuth_Pollinations_Text
- **Base URL**: `https://text.pollinations.ai/`
- **Rate Limit**: Free with 15-second intervals (anonymous)
- **Notes**: Free with rate limits, no API key required

#### NoAuth_Pollinations_Image
- **Base URL**: `https://image.pollinations.ai/prompt/`
- **Rate Limit**: Free with 15-second intervals (anonymous)
- **Notes**: Free with rate limits, no API key required

### 2. API Key Required Providers
These providers require API keys for better access and higher rate limits.

#### OpenRouter
- **Base URL**: `https://openrouter.ai/api/v1/chat/completions`
- **Rate Limit**: Up to 20 requests per minute
- **Notes**: Unified API for multiple models, variable by tier
- **Getting API Key**: Sign up at [openrouter.ai](https://openrouter.ai)

#### ImageRouter
- **Base URL**: `https://api.imagerouter.io/v1/openai/images/generations`
- **Rate Limit**: 6 requests/second
- **Models**: Google Gemini 2.5 Flash, FLUX-1-schnell, HiDream-I1-Full, Chroma
- **Notes**: Specialized for image generation
- **Getting API Key**: Sign up at [imagerouter.io](https://api.imagerouter.io)

#### Pollinations_Text (with API key)
- **Base URL**: `https://text.pollinations.ai/`
- **Rate Limit**: Free with 5-15 second intervals
- **Notes**: Faster with API key compared to anonymous access
- **Getting API Key**: Contact Pollinations for API access

#### Pollinations_Image (with API key)
- **Base URL**: `https://image.pollinations.ai/prompt/`
- **Rate Limit**: Free with 5-15 second intervals
- **Notes**: Faster with API key compared to anonymous access
- **Getting API Key**: Contact Pollinations for API access

#### GitHub_Models
- **Base URL**: `https://models.github.ai`
- **Rate Limit**: Variable by tier
- **Notes**: MUST UPDATE - Azure endpoint deprecated Oct 17 2025
- **Getting API Key**: GitHub account required

#### Zuki_Journey
- **Base URL**: `https://api.zukijourney.com/v1`
- **Rate Limit**: Unknown
- **Notes**: Standard OpenAI format
- **Getting API Key**: Sign up at [zukijourney.com](https://api.zukijourney.com)

#### HelixMind
- **Base URL**: `https://helixmind.online/v1`
- **Rate Limit**: 100 API requests/day with 1 request per 30 seconds
- **Models**: GPT-4o-mini, GPT-4o, DeepSeek-V3, FLUX.1-schnell, DALL-E-3
- **Notes**: Standard OpenAI format
- **Getting API Key**: Sign up at [helixmind.online](https://helixmind.online)

#### VoidAI
- **Base URL**: `https://api.voidai.app/v1`
- **Rate Limit**: 125,000 daily credits
- **Notes**: Standard OpenAI format
- **Getting API Key**: Sign up at [voidai.app](https://api.voidai.app)

#### MNNAI
- **Base URL**: `https://api.mnnai.ru/v1/`
- **Rate Limit**: Unknown
- **Models**: Has free models (0.01 cost)
- **Notes**: Russian provider with free tier
- **Getting API Key**: Sign up at [mnnai.ru](https://api.mnnai.ru)

#### Z.ai
- **Base URL**: `https://api.z.ai/api/paas/v4/`
- **Rate Limit**: Concurrency limit of 2
- **Models**: GLM-4.5-Flash
- **Notes**: GLM models
- **Getting API Key**: Sign up at [z.ai](https://api.z.ai)

#### Bigmodel.cn
- **Base URL**: `https://open.bigmodel.cn/api/paas/v4/`
- **Rate Limit**: Concurrency limit of 2
- **Models**: Multiple GLM variants including text, video, and image models
- **Notes**: GLM models, Chinese provider
- **Getting API Key**: Sign up at [open.bigmodel.cn](https://open.bigmodel.cn)

#### ElectronHub
- **Base URL**: `https://api.electronhub.ai`
- **Rate Limit**: 7 requests per minute
- **Notes**: Standard OpenAI format
- **Getting API Key**: Sign up at [electronhub.ai](https://api.electronhub.ai)

#### NavyAI
- **Base URL**: `https://api.navy/v1/`
- **Rate Limit**: 800,000 tokens free per day
- **Notes**: Standard OpenAI format
- **Getting API Key**: Sign up at [navy](https://api.navy)

## How to Use the CSV File

### 1. Getting API Keys
For providers that require API keys:
1. Visit the provider's website
2. Sign up for an account
3. Navigate to API/Developer section
4. Generate your API key
5. Replace `key_example` in the CSV with your actual API key

### 2. Setting Up Providers
1. Copy `g4f_providers_template.csv` to `providers.csv`
2. Replace `key_example` placeholders with your actual API keys
3. Save the file

### 3. Rate Limit Management
- **Respect rate limits**: Each provider has different limits
- **Implement delays**: Add appropriate delays between requests
- **Monitor usage**: Track your usage to avoid hitting limits
- **Use multiple providers**: Distribute load across multiple providers

### 4. Best Practices

#### For No-Auth Providers:
- Use for non-critical tasks
- Implement exponential backoff for rate limits
- Be prepared for temporary unavailability

#### For API Key Providers:
- Keep your API keys secure
- Monitor your usage regularly
- Understand the pricing model (even for "free" tiers)
- Have backup providers ready

#### General Guidelines:
- Always check the provider's terms of service
- Respect rate limits to avoid being blocked
- Implement proper error handling
- Log your usage for monitoring

## Common Rate Limit Patterns

### Time-based Limits:
- **15-second intervals**: Pollinations (no-auth)
- **30-second intervals**: HelixMind
- **5-15 second intervals**: Pollinations (with API key)

### Request-based Limits:
- **20 requests/minute**: OpenRouter
- **6 requests/second**: ImageRouter
- **7 requests/minute**: ElectronHub

### Token-based Limits:
- **800,000 tokens/day**: NavyAI

### Concurrency Limits:
- **2 concurrent requests**: Z.ai, Bigmodel.cn

## Troubleshooting

### Common Issues:
1. **Rate limit exceeded**: Implement delays and use multiple providers
2. **Invalid API key**: Verify your API key is correctly entered
3. **Model not available**: Check the model list endpoint for available models
4. **Connection errors**: Verify your internet connection and provider status

### Error Codes to Watch For:
- 429: Too Many Requests (rate limit)
- 401: Unauthorized (invalid API key)
- 403: Forbidden (access denied)
- 503: Service Unavailable (provider down)

## Monitoring and Maintenance

### Regular Checks:
- Monitor provider availability
- Track usage against rate limits
- Update API keys when they expire
- Review provider terms periodically

### Provider Updates:
- Some providers may change their endpoints
- Rate limits may be adjusted
- New models may become available
- Deprecation notices should be heeded (e.g., GitHub Models)

## Conclusion

The `g4f_providers_template.csv` file provides access to a wide variety of AI providers with different strengths and limitations. By understanding each provider's requirements and respecting their limits, you can build robust applications that leverage multiple AI services while staying within free plan constraints.

Remember to:
- Always respect rate limits
- Keep API keys secure
- Monitor usage regularly
- Have backup providers ready
- Stay informed about provider changes