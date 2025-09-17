# 🚀 Your PaL MoE  
**API Server for Multi-Provider AI Access with Named Tools**

Your PaL MoE is an API Porxy Aggregator that provides access to multiple AI providers through Named Tools. It lets you define AI providers in a **simple CSV file** and automatically generates an **OpenAI-compatible `providers.json`**.

The system features **direct model access**, **provider management**, and a **pluggable parser system** — making it easy to access multiple AI providers through standardized API tools while maintaining compatibility with various model formats.

---

## ✨ Features

- **🛠️ Named Tool Integration**  
  Each model becomes directly callable through the API protocol.

- **⚡ Multi-Provider Support**  
  Access models from OpenAI, Anthropic, HuggingFace, and other providers through unified tools.

- **🔄 Mode-Aware Execution**  
  6 different collaboration modes (Council, Collaborate, Race, MetaJudge, Discuss, Fallback) for different teamwork strategies.

- **⚡ Intelligent Request Routing**  
  Smart routing and load balancing across multiple AI providers with automatic failover.

- **🎯 Intelligent Provider Selection**  
  Automatic selection of optimal providers based on model capabilities and performance metrics.

- **🔌 Pluggable Parser System**  
  Extensible parsing framework for different model providers (OpenAI, Anthropic, HuggingFace, etc.).

- **📊 OpenAI Protocol Compliance**  
  Full API server implementation with OpenAI Compatible endpoints.

- **📄 CSV-Driven Configuration**  
  Add or update providers in a spreadsheet-friendly CSV format.

---

## 🗏️ Architecture

### Core Architecture Pattern
Your PaL MoE implements an **API Server with Named Tool Registration**. Each model from the configured providers becomes a directly callable Named Tool, allowing API clients to access any model through standardized tool calls.

### Key Architectural Layers

1. **Configuration Layer** ([`rolesConfig.js`](rolesConfig.js))
   - Manages provider configurations and model specifications
   - Handles model-to-tool mapping and registration

2. **API Server Layer** ([`taskmaster.js`](taskmaster.js))
   - Implements API protocol for tool registration and execution
   - Handles tool discovery and method routing

3. **Tool Execution Layer** ([`modeHandlers.js`](modeHandlers.js))
   - Executes Named Tool calls to specific models
   - Handles different collaboration modes when multiple tools are used

4. **Data Processing Layer** ([`parsers/`](parsers/), [`schema/`](schema/))
   - Standardizes model profiles across providers
   - Validates and normalizes configuration data

### Workflow Example

1. **API Client Connection**: Client connects to Your PaL MoE API server
2. **Tool Discovery**: Client discovers available Named Tools (one per model)
3. **Tool Execution**: Client calls specific model tool (e.g., "gpt-4-turbo", "claude-3-sonnet")
4. **Request Processing**: Server routes request to appropriate provider
5. **Response Return**: Formatted response returned through API protocol

### Key Strengths

- **Direct Access**: Each model accessible as individual Named Tool
- **API Compliance**: Full API protocol implementation
- **Multi-Provider**: Support for various AI providers in single server
- **Flexibility**: Multiple execution modes for collaboration scenarios
- **Simplicity**: Easy provider management through CSV configuration

---

## 📂 Project Structure

```
Your PaL MoE/
├── providers.csv              # Your provider definitions
├── providers.json             # Auto-generated for the router
├── csv-to-providers.js        # CSV → JSON generator module
├── index.js                   # API server implementation
├── rolesConfig.js            # Provider and model configuration
├── taskmaster.js             # Tool registration and execution
├── modeHandlers.js           # Collaboration mode implementations (optional)
├── parsers/                  # Pluggable model parsing system
│   └── index.js              # Provider-specific parsers
├── schema/                   # Data validation and normalization
│   └── modelProfileSchema.js # Model profile standards
├── cache/                    # Cached model profiles
│   └── model_profiles.json   # Cached provider data
├── scripts/                  # Utility scripts
│   └── build-model-profile.js # Profile generation utilities
└── README.md
```

---

## 💥 Named Tools

Each model configured in your `providers.csv` becomes a Named Tool that API clients can call directly:

### Example Available Tools

- **gpt-4-turbo**: OpenAI's GPT-4 Turbo model
- **gpt-3.5-turbo**: OpenAI's GPT-3.5 Turbo model  
- **claude-3-sonnet**: Anthropic's Claude 3 Sonnet model
- **claude-3-haiku**: Anthropic's Claude 3 Haiku model
- **llama-2-70b**: Meta's LLaMA 2 70B model

### Tool Call Example

```javascript
// API client calling specific model tool
const response = await APIClient.callTool({
  name: "gpt-4-turbo",
  arguments: {
    messages: [
      { role: "user", content: "Hello, how are you?" }
    ],
    temperature: 0.7
  }
});
```

---

## 📝 CSV Format

| Name           | Base_URL                  | APIKey         | Model(s)                              | Priority | TokenMultiplier | ForceEndpoint |
|----------------|---------------------------|----------------|----------------------------------------|----------|-----------------|---------------|
| OpenAI-Primary | https://api.openai.com/v1 | sk-xxxx        | gpt-4\|gpt-3.5-turbo                      | 1        | 1.0             |               |
| Pollinations   | https://text.pollinations.ai |               | https://pollinations.ai/api/models    | 2        | 1.0             |               |

- **Model(s)** can be:
  - A `|`-delimited list of model IDs.
  - A URL returning a list of models (JSON).
- **ForceEndpoint** (optional) overrides automatic endpoint detection.

---

## ⚙️ How It Works

1. **Server Startup**  
   API server reads provider configuration and registers each model as a Named Tool.

2. **Tool Registration**  
   Each model becomes discoverable and callable through the API protocol.

3. **Client Connection**  
   API clients connect and discover available model tools.

4. **Tool Execution**  
   Clients call specific model tools with request parameters.

5. **Request Processing**  
   Server routes requests to appropriate providers and returns responses.

6. **Provider Management**  
   CSV-driven provider configuration with automatic tool registration.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- API keys from your preferred AI providers

### 1. Clone & Install
```bash
git clone https://github.com/YOUR-USERNAME/Your PaL MoE.git
cd Your PaL MoE
npm install
```

### 2. Configure Providers
Edit [`providers.csv`](providers.csv) with your provider details and model specifications:

```csv
Name,Base_URL,APIKey,Model(s),Priority,TokenMultiplier,ForceEndpoint
OpenAI-Primary,https://api.openai.com/v1,sk-your-gpt-key,gpt-4|gpt-3.5-turbo,1,1.0,
Anthropic-Secondary,https://api.anthropic.com,v1-your-claude-key,claude-3-sonnet|claude-3-haiku,2,1.0,
```

**CSV Fields:**
- **Name**: Friendly name for your provider
- **Base_URL**: API endpoint URL
- **APIKey**: Your API key (leave empty for keyless providers)
- **Model(s)**: Pipe-separated model IDs or URL to model list
- **Priority**: Lower numbers = higher priority (1-99)
- **TokenMultiplier**: Cost adjustment factor (default: 1.0)
- **ForceEndpoint**: Override automatic endpoint detection (optional)

### 3. Generate Configuration
Convert your CSV to JSON configuration:
```bash
node csv-to-providers.js
```

### 4. Run the API Server
```bash
npm start
```

The server will start on `http://localhost:2715` by default.

### 5. Test Your Setup
Open your browser to `http://localhost:2715` to see the status page with token usage statistics.

### 6. Connect API Client

#### Using curl (for testing):
```bash
# List available models
curl http://localhost:2715/v1/models

# Chat with a model
curl -X POST http://localhost:2715/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello world"}]
  }'
```

#### Using JavaScript (Node.js):
```javascript
const fetch = require('node-fetch');

// Chat with a model
async function chat() {
  const response = await fetch('http://localhost:2715/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello world' }]
    })
  });
  
  const data = await response.json();
  console.log(data.choices[0].message.content);
}

chat();
```

#### Using Python:
```python
import requests

# Chat with a model
response = requests.post(
    'http://localhost:2715/v1/chat/completions',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
    },
    json={
        'model': 'gpt-4',
        'messages': [{'role': 'user', 'content': 'Hello world'}]
    }
)

print(response.json()['choices'][0]['message']['content'])
```

### 7. User Management (Optional)

Create users with different plans using the admin API:
```bash
# Add a user with free plan (500k tokens daily)
curl -X POST http://localhost:2715/admin/keys \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "add",
    "api_key": "sk-user-key",
    "username": "testuser",
    "plan": "500k"
  }'
```

### Available Endpoints

- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - Chat completion
- `POST /v1/images/generations` - Image generation
- `POST /v1/audio/transcriptions` - Audio transcription
- `POST /v1/audio/speech` - Text to speech
- `GET /v1/usage` - Token usage statistics
- `GET /admin/keys` - User management (requires admin key)

---

## 📋 Example Tool Response

```json
{
  "toolName": "gpt-4-turbo",
  "result": {
    "choices": [{
      "message": {
        "role": "assistant",
        "content": "def sort_array(arr):\n    return sorted(arr)"
      }
    }],
    "usage": {
      "prompt_tokens": 12,
      "completion_tokens": 15,
      "total_tokens": 27
    }
  }
}
```

---

## 🧠 Roadmap

- [ ] Enhanced API protocol feature support
- [ ] Dynamic model discovery and registration
- [ ] Real-time provider health monitoring
- [ ] Advanced collaboration modes for multi-model workflows
- [ ] Provider-specific parameter optimization
- [ ] API client libraries and documentation

---

## 📜 License
MIT License — see [LICENSE](LICENSE) for details.

---

## 🙌 Acknowledgements
- [Model Context Protocol (API)](https://modelcontextprotocol.org/) for the protocol specification
- [Exoml Router](https://github.com/exomlapi/exomlapi) for the original routing framework
- All AI providers integrated via Your PaL MoE
- The open-source AI community for inspiration and contributions
