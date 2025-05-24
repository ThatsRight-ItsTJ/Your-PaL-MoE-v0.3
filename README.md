# Exomlapi

**Build AI systems with unmatched scale.**

Exomlapi offers high-volume access to AI models, designed for builders who push boundaries. We provide a robust and reliable service with a focus on simplicity and power.

## Features

*   **Massive Scale:** Process over 1 billion tokens per day, suitable for demanding AI workloads, including agents and large-scale data pipelines.
*   **No Rate Limits:** Enjoy unrestricted access without worrying about hitting rate limits.
*   **Lifetime Plans:** Pay once for permanent access. No recurring subscriptions.
*   **Crypto-Only Payments:** Secure and anonymous transactions using Bitcoin (BTC) and Ethereum (ETH). (PayPal F&F and Ko-Fi also accepted via Discord).
*   **100% OpenAI-Compatible:** Use your existing OpenAI library code. Just change the API base URL.
*   **Decentralized Infrastructure:** Powered by decentralized compute networks and secure blockchain transactions for maximum reliability.
## Open-Source Exoml Router

Exomlapi also provides an open-source AI router, the code for which you can find in this project (e.g., [`index.js`](index.js:1)). This Node.js application, built with Express, serves as a flexible and powerful API gateway that allows you to:

*   **Proxy and Route Requests:** Intelligently forward API calls to various configured AI model providers.
*   **Manage Users and API Keys:** Control access, define user plans, and track token usage via a [`users.json`](users.json:1) file.
*   **Configure Backend Providers:** Easily define and manage different AI service providers, their API keys, and specific models they offer through a [`providers.json`](providers.json:1) configuration file.
*   **Monitor Token Usage:** Includes built-in endpoints to get statistics on token consumption.
*   **Maintain OpenAI SDK Compatibility:** Designed to work seamlessly with existing OpenAI libraries by routing standard API paths (e.g., `/v1/chat/completions`).
*   **Dynamic Configuration Reloading:** Automatically reloads provider configurations ([`providers.json`](providers.json:1)) when changes are detected, ensuring up-to-date routing without server restarts.
*   **Admin Endpoints:** Provides administrative functionalities for managing user keys and plans.

This router is a core component that can be self-hosted, offering you transparency and control over your AI request routing and management.

## Getting Started

Using Exomlapi is straightforward. If you're already using the OpenAI SDK, you only need to change the `baseURL`.

```javascript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: "your-api-key", // Your Exomlapi API key
  baseURL: "https://api.exomlapi.com/v1"
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo", // Or any other supported model
    messages: [{ role: "user", content: "Tell me a joke about blockchain." }]
  });

  console.log(completion.choices[0].message.content);
}

main();
```

## Supported API Endpoints

Exomlapi supports the following OpenAI-compatible endpoints:

*   `POST /v1/chat/completions`
*   `POST /v1/completions`
*   `POST /v1/embeddings`
*   `POST /v1/images/generations`
*   `GET /v1/models` (Optional)

## Pricing

Choose a lifetime plan that suits your needs.

### Standard Plan
*   **Price:** €100 (one-time payment)
*   **Tokens:** 100 million tokens/day
*   **Rate Limits:** None
*   **Access:** Permanent
*   **Payments:** BTC/ETH

### Premium Plan (Recommended)
*   **Price:** €500 (one-time payment)
*   **Tokens:** 1 billion+ tokens/day
*   **Rate Limits:** None
*   **Access:** Permanent
*   **Routing:** Priority
*   **Payments:** BTC/ETH

## Payments

*   **Primary:** Bitcoin (BTC) and Ethereum (ETH).
*   **Alternative:** We also accept PayPal Friends & Family and Ko-Fi. Please contact us on Discord for these payment methods.

## Request a Trial

Ask for a free 1-day trial – no strings attached. Contact us via Chat or Discord.

## Contact & Support

*   **Discord:** Join our Discord server for support, alternative payment methods, and community interaction.
*   **Status Page:** Check the [Exomlapi Status](https://status.exomlapi.com) (assuming a status page exists, link if available otherwise remove).

---

**EXOMLAPI - Unlimited AI tokens for builders who push boundaries.**

