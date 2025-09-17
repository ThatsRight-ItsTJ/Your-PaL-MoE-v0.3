# 🚀 Your PaL MoE  
**MCP Server for Multi-Provider AI Access with Named Tools**

Your PaL MoE is an MCP (Model Context Protocol) server that provides access to multiple AI providers through Named Tools. It lets you define AI providers in a **simple CSV file** and automatically generates an **OpenAI-compatible `providers.json`** where each model becomes a callable Named Tool.

The system features **direct model access**, **provider management**, and a **pluggable parser system** — making it easy to access multiple AI providers through standardized MCP tools while maintaining compatibility with various model formats.

---

## ✨ Features

- **🛠️ Named Tool Integration**  
  Each model becomes a directly callable Named Tool through the MCP protocol.

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

- **📊 MCP Protocol Compliance**  
  Full MCP server implementation with proper tool registration and execution.

- **📄 CSV-Driven Configuration**  
  Add or update providers in a spreadsheet-friendly CSV format.

---

## 🗏️ Architecture

### Core Architecture Pattern
Your PaL MoE implements an **MCP Server with Named Tool Registration**. Each model from the configured providers becomes a directly callable Named Tool, allowing MCP clients to access any model through standardized tool calls.

### Key Architectural Layers

1. **Configuration Layer** ([`rolesConfig.js`](rolesConfig.js))
   - Manages provider configurations and model specifications
   - Handles model-to-tool mapping and registration

2. **MCP Server Layer** ([`taskmaster.js`](taskmaster.js))
   - Implements MCP protocol for tool registration and execution
   - Handles tool discovery and method routing

3. **Tool Execution Layer** ([`modeHandlers.js`](modeHandlers.js))
   - Executes Named Tool calls to specific models
   - Handles different collaboration modes when multiple tools are used

4. **Data Processing Layer** ([`parsers/`](parsers/), [`schema/`](schema/))
   - Standardizes model profiles across providers
   - Validates and normalizes configuration data

### Workflow Example

1. **MCP Client Connection**: Client connects to Your PaL MoE MCP server
2. **Tool Discovery**: Client discovers available Named Tools (one per model)
3. **Tool Execution**: Client calls specific model tool (e.g., "gpt-4-turbo", "claude-3-sonnet")
4. **Request Processing**: Server routes request to appropriate provider
5. **Response Return**: Formatted response returned through MCP protocol

### Key Strengths

- **Direct Access**: Each model accessible as individual Named Tool
- **MCP Compliance**: Full MCP protocol implementation
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
├── index.js                   # MCP server implementation
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

Each model configured in your `providers.csv` becomes a Named Tool that MCP clients can call directly:

### Example Available Tools

- **gpt-4-turbo**: OpenAI's GPT-4 Turbo model
- **gpt-3.5-turbo**: OpenAI's GPT-3.5 Turbo model  
- **claude-3-sonnet**: Anthropic's Claude 3 Sonnet model
- **claude-3-haiku**: Anthropic's Claude 3 Haiku model
- **llama-2-70b**: Meta's LLaMA 2 70B model

### Tool Call Example

```javascript
// MCP client calling specific model tool
const response = await mcpClient.callTool({
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
   MCP server reads provider configuration and registers each model as a Named Tool.

2. **Tool Registration**  
   Each model becomes discoverable and callable through the MCP protocol.

3. **Client Connection**  
   MCP clients connect and discover available model tools.

4. **Tool Execution**  
   Clients call specific model tools with request parameters.

5. **Request Processing**  
   Server routes requests to appropriate providers and returns responses.

6. **Provider Management**  
   CSV-driven provider configuration with automatic tool registration.

---

## 🚀 Getting Started

### 1. Clone & Install
```bash
git clone https://github.com/YOUR-USERNAME/Your PaL MoE.git
cd Your PaL MoE
npm install
```

### 2. Configure Providers
Edit [`providers.csv`](providers.csv) with your provider details and model specifications.

### 3. Run the MCP Server
```bash
npm start
```

### 4. Connect MCP Client
```javascript
import { MCPClient } from "@mcp/client";

const client = new MCPClient({
  serverUrl: "http://localhost:3000"
});

// Discover available tools
const tools = await client.listTools();
console.log(tools); // Shows all model tools

// Call specific model
const response = await client.callTool({
  name: "gpt-4-turbo",
  arguments: {
    messages: [{ role: "user", content: "Hello world" }]
  }
});

// Call multiple models with collaboration mode
const multiResponse = await client.callTool({
  name: "collaborate",
  arguments: {
    models: ["gpt-4-turbo", "claude-3-sonnet"],
    messages: [{ role: "user", content: "Write a Python function" }]
  }
});
```

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

- [ ] Enhanced MCP protocol feature support
- [ ] Dynamic model discovery and registration
- [ ] Real-time provider health monitoring
- [ ] Advanced collaboration modes for multi-model workflows
- [ ] Provider-specific parameter optimization
- [ ] MCP client libraries and documentation

---

## 📜 License
MIT License — see [LICENSE](LICENSE) for details.

---

## 🙌 Acknowledgements
- [Model Context Protocol (MCP)](https://modelcontextprotocol.org/) for the protocol specification
- [Exoml Router](https://github.com/exomlapi/exomlapi) for the original routing framework
- All AI providers integrated via Your PaL MoE
- The open-source AI community for inspiration and contributions
