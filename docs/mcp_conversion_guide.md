# MCP Server Conversion Guide
## Converting Your-PaL-MoE-v0.3 API Proxy to Model Context Protocol (MCP) Server

**Version:** 1.0  
**Target System:** Your-PaL-MoE-v0.3  
**Estimated Implementation Time:** 2-3 weeks  
**Difficulty Level:** Intermediate to Advanced  

---

## Table of Contents

1. [Overview](#overview)
2. [Why Convert to MCP](#why-convert-to-mcp)
3. [MCP Fundamentals](#mcp-fundamentals)
4. [Technical Architecture](#technical-architecture)
5. [Implementation Plan](#implementation-plan)
6. [Phase 1: Core MCP Infrastructure](#phase-1-core-mcp-infrastructure)
7. [Phase 2: Tool Implementation](#phase-2-tool-implementation)
8. [Phase 3: Resource Management](#phase-3-resource-management)
9. [Phase 4: Transport Layer](#phase-4-transport-layer)
10. [Testing Strategy](#testing-strategy)
11. [Deployment Considerations](#deployment-considerations)
12. [Migration Strategy](#migration-strategy)
13. [Troubleshooting](#troubleshooting)
14. [Resources and References](#resources-and-references)

---

## Overview

This document provides comprehensive instructions for converting the existing Your-PaL-MoE-v0.3 API proxy system into a Model Context Protocol (MCP) server while maintaining full backwards compatibility with the existing REST API.

The conversion will enable direct integration with MCP-compatible AI clients (like Claude Desktop, VSCode with MCP, etc.) while preserving all existing functionality and adding new capabilities.

### Current System Architecture

Your-PaL-MoE-v0.3 currently operates as:
- **HTTP API Proxy** - Routes requests to multiple AI providers
- **Load Balancer** - Distributes load and handles provider failover
- **Security Layer** - Manages authentication, rate limiting, and validation
- **Multi-Provider Manager** - Handles 15+ AI providers with unified interface

### Target MCP Architecture

The converted system will operate as:
- **Dual-Interface Server** - Both REST API and MCP protocol support
- **MCP Tool Provider** - Exposes AI provider capabilities as MCP tools
- **Resource Manager** - Provides MCP resources for configuration and monitoring
- **Transport Handler** - Supports multiple MCP transport protocols

---

## Why Convert to MCP

### Strategic Benefits

1. **Native AI Assistant Integration**
   - Direct integration with Claude Desktop, VSCode, Cursor, and other MCP clients
   - No need for custom API wrappers or middleware
   - Standardized tool calling interface

2. **Enhanced Capabilities**
   - **Rich Tool Descriptions** - Better discoverability and usage
   - **Streaming Support** - Real-time response handling
   - **Resource Access** - Direct access to configurations and monitoring data
   - **Prompt Templates** - Pre-configured prompts for common tasks

3. **Future-Proofing**
   - MCP is the emerging standard for AI tool integration
   - Growing ecosystem of MCP-compatible clients
   - Anthropic and other major AI companies backing the protocol

4. **Improved Developer Experience**
   - Standardized protocol reduces integration complexity
   - Better error handling and status reporting
   - Built-in capability discovery

### Technical Advantages

- **Protocol Efficiency** - Binary JSON-RPC 2.0 over various transports
- **Stateful Connections** - Persistent connections for better performance
- **Tool Discovery** - Automatic capability advertisement
- **Error Standardization** - Consistent error reporting across tools

---

## MCP Fundamentals

### Core Concepts

#### **Tools**
Functions that MCP clients can call - equivalent to our current API endpoints:
- Input validation and schema definition
- Execution logic (your existing provider routing)
- Response formatting and error handling

#### **Resources** 
Data/content that MCP clients can access:
- Provider configurations
- Usage statistics
- Model availability information
- Health check results

#### **Prompts**
Pre-configured prompt templates with parameters:
- Provider-specific optimization prompts
- Multi-provider comparison templates
- Debugging and diagnostic prompts

#### **Transports**
Communication protocols between MCP client and server:
- **STDIO** - Standard input/output (for local CLI tools)
- **SSE** - Server-Sent Events (being deprecated)
- **StreamableHTTP** - HTTP with streaming support
- **StreamableHTTPJSON** - Stateless JSON-RPC over HTTP (recommended for web deployments)

### MCP Message Flow

1. **Initialization** - Client connects and exchanges capabilities
2. **Discovery** - Client requests available tools, resources, and prompts
3. **Tool Calls** - Client invokes tools with parameters
4. **Resource Access** - Client requests specific resources
5. **Notifications** - Server can notify client of changes

---

## Technical Architecture

### Dual-Interface Design

The converted system will maintain both interfaces simultaneously:

```
┌─────────────────────┐
│   MCP Client        │
│ (Claude Desktop)    │
└─────────┬───────────┘
          │ MCP Protocol
          ▼
┌─────────────────────┐    ┌─────────────────────┐
│   MCP Transport     │    │   REST API          │
│   Layer             │    │   (Express.js)      │
└─────────┬───────────┘    └─────────┬───────────┘
          │                          │
          ▼                          ▼
┌─────────────────────────────────────────────────┐
│           Shared Business Logic                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │ Provider    │ │ Auth &      │ │ Load        ││
│  │ Management  │ │ Security    │ │ Balancing   ││
│  └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────┐
│               AI Providers                      │
│  OpenRouter │ GitHub │ Pollinations │ Others... │
└─────────────────────────────────────────────────┘
```

### Key Components to Add

1. **MCP Protocol Handler** - Message parsing and response formatting
2. **Tool Registry** - Dynamic tool registration and management
3. **Resource Manager** - Resource discovery and access control
4. **Transport Managers** - Multiple transport protocol support
5. **Capability Manager** - Advertisement of server capabilities

---

## Implementation Plan

### Development Phases

#### **Phase 1: Core MCP Infrastructure** (Week 1)
- MCP message handling foundation
- Basic transport layer (StreamableHTTPJSON)
- Tool registry framework
- Integration with existing middleware

#### **Phase 2: Tool Implementation** (Week 1-2)
- Convert existing endpoints to MCP tools
- Implement tool schemas and validation
- Add streaming response support
- Error handling and status reporting

#### **Phase 3: Resource Management** (Week 2)
- Expose configuration as MCP resources
- Add monitoring and statistics resources
- Implement resource access controls
- Dynamic resource updates

#### **Phase 4: Transport Layer** (Week 2-3)
- Add STDIO transport for local usage
- Implement connection management
- Add WebSocket support (optional)
- Performance optimization

#### **Phase 5: Testing & Documentation** (Week 3)
- Comprehensive testing suite
- Integration testing with MCP clients
- Documentation and examples
- Performance benchmarking

---

## Phase 1: Core MCP Infrastructure

### Dependencies to Add

Add these packages to `package.json`:

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.6.0",
    "json-rpc-2.0": "^1.5.0",
    "ws": "^8.14.0",
    "uuid": "^9.0.0"
  }
}
```

### Directory Structure Changes

Create new directories in your project:

```
your-pal-moe-v0.3/
├── mcp/                          # New MCP-specific code
│   ├── server/                   # MCP server implementation
│   │   ├── index.js             # Main MCP server
│   │   ├── transport/           # Transport layer implementations
│   │   ├── tools/               # MCP tool definitions
│   │   ├── resources/           # MCP resource handlers
│   │   └── prompts/             # MCP prompt definitions
│   ├── schemas/                 # JSON schemas for tools
│   └── types/                   # TypeScript type definitions (optional)
├── config/
│   └── mcp-config.json          # MCP-specific configuration
├── docs/
│   └── mcp/                     # MCP documentation
│       ├── api.md               # MCP API documentation
│       ├── tools.md             # Tool usage guide
│       └── integration.md       # Client integration guide
```

### Core MCP Server Structure

The main MCP server file should:

1. **Initialize MCP Server** - Set up the MCP SDK server instance
2. **Register Transports** - Add HTTP, STDIO, and other transport handlers
3. **Register Tools** - Connect your existing business logic as MCP tools
4. **Register Resources** - Expose configurations and data as resources
5. **Start Services** - Begin listening on configured transports

### Configuration Updates

Update your `.env` file with MCP-specific settings:

```bash
# MCP Configuration
MCP_ENABLED=true
MCP_PORT=3001
MCP_TRANSPORTS=stdio,http,httpjson
MCP_SERVER_NAME="Your-PaL-MoE MCP Server"
MCP_SERVER_VERSION="0.3.0"

# Transport-specific settings
MCP_HTTP_ENDPOINT=/mcp
MCP_STDIO_ENABLED=true
MCP_HTTP_JSON_ENABLED=true

# Tool Configuration
MCP_TOOLS_ENABLED=chat_completion,image_generation,list_models,provider_status
MCP_RESOURCES_ENABLED=config,stats,health

# Security
MCP_REQUIRE_AUTH=true
MCP_ALLOWED_ORIGINS=*
MCP_SESSION_TIMEOUT=300000
```

### Integration Points

Identify where to hook MCP into your existing architecture:

1. **Authentication Middleware** - Reuse existing auth for MCP tool calls
2. **Provider Management** - Expose provider logic through MCP tools
3. **Error Handling** - Convert existing error responses to MCP format
4. **Logging** - Extend current logging to include MCP events
5. **Health Checks** - Expose health data through MCP resources

---

## Phase 2: Tool Implementation

### Tool Conversion Strategy

Convert your existing API endpoints to MCP tools:

#### Current Endpoint → MCP Tool Mapping

| Current Endpoint | MCP Tool | Description |
|------------------|----------|-------------|
| `POST /v1/chat/completions` | `chat_completion` | Chat completion with provider routing |
| `POST /v1/images/generations` | `image_generation` | Image generation across providers |
| `GET /v1/models` | `list_models` | Available models from all providers |
| `GET /health` | `provider_status` | Health check for all providers |
| `GET /v1/usage` | `usage_stats` | Usage statistics and limits |
| Custom endpoints | `switch_provider` | Dynamic provider selection |

### Tool Schema Definition

Each tool needs a JSON schema defining:

1. **Name and Description** - Clear, descriptive tool identification
2. **Input Schema** - Parameter validation and type definitions
3. **Output Schema** - Response format specification
4. **Error Handling** - Standardized error responses

Example tool schema structure:

```json
{
  "name": "chat_completion",
  "description": "Generate chat completions using optimal provider routing",
  "inputSchema": {
    "type": "object",
    "properties": {
      "messages": {
        "type": "array",
        "description": "Chat messages in OpenAI format"
      },
      "model": {
        "type": "string", 
        "description": "Preferred model (optional - auto-selected if not specified)"
      },
      "provider": {
        "type": "string",
        "description": "Force specific provider (optional)"
      }
    },
    "required": ["messages"]
  }
}
```

### Tool Implementation Pattern

Each tool should follow this pattern:

1. **Input Validation** - Validate against schema
2. **Authentication Check** - Verify client permissions
3. **Rate Limit Check** - Apply existing rate limiting
4. **Business Logic** - Route to existing provider logic
5. **Response Formatting** - Convert to MCP response format
6. **Error Handling** - Standardized MCP error responses

### Streaming Support

For chat completions and long-running operations:

1. **Stream Detection** - Check if client supports streaming
2. **Chunk Formatting** - Format responses as MCP stream chunks
3. **Connection Management** - Handle client disconnections gracefully
4. **Progress Updates** - Send progress notifications for long operations

### Provider Selection Logic

Enhance your existing provider selection with MCP-specific features:

1. **Tool-Level Overrides** - Allow tools to specify preferred providers
2. **Client Preferences** - Store client-specific provider preferences
3. **Capability Matching** - Match tool requirements to provider capabilities
4. **Fallback Chains** - Define provider fallback sequences per tool

---

## Phase 3: Resource Management

### Resource Types to Implement

#### **Configuration Resources**

1. **Provider Config** (`mcp://config/providers`)
   - Available providers and their capabilities
   - Current provider status and health
   - Rate limits and quotas per provider

2. **Model Registry** (`mcp://config/models`)
   - All available models across providers
   - Model capabilities and specifications
   - Pricing and usage information

3. **User Settings** (`mcp://config/user/{user_id}`)
   - User-specific preferences
   - API usage statistics
   - Rate limit status

#### **Monitoring Resources**

1. **Real-time Stats** (`mcp://stats/realtime`)
   - Current request rates
   - Provider response times
   - Error rates by provider

2. **Historical Data** (`mcp://stats/historical`)
   - Usage trends over time
   - Provider performance history
   - Cost analysis data

3. **Health Status** (`mcp://health/providers`)
   - Current provider availability
   - Response time metrics
   - Error rate monitoring

### Resource Access Controls

Implement security for resource access:

1. **Authentication** - Verify client credentials
2. **Authorization** - Check permissions for specific resources
3. **Rate Limiting** - Prevent resource abuse
4. **Data Filtering** - Return only authorized data subsets

### Dynamic Resource Updates

Enable real-time resource updates:

1. **Change Detection** - Monitor for configuration changes
2. **Notification System** - Alert clients of resource updates
3. **Caching Strategy** - Optimize resource access performance
4. **Versioning** - Handle resource schema evolution

---

## Phase 4: Transport Layer

### Transport Implementation Priority

1. **StreamableHTTPJSON** (Primary)
   - Stateless, easy to deploy
   - Compatible with web environments
   - Best for production deployments

2. **STDIO** (Secondary)
   - Local integration support
   - Claude Desktop compatibility
   - Development and testing

3. **StreamableHTTP** (Optional)
   - Stateful connections
   - Better performance for frequent calls
   - Complex connection management

### HTTP Transport Configuration

Set up HTTP transport with these endpoints:

- `GET /mcp` - MCP server information and capabilities
- `POST /mcp` - MCP JSON-RPC message handling
- `GET /mcp/health` - MCP-specific health check
- `WebSocket /mcp/ws` - WebSocket transport (optional)

### STDIO Transport Setup

For local usage and Claude Desktop integration:

1. **Command Line Interface** - Accept STDIO transport flag
2. **Message Parsing** - Handle JSON-RPC over stdin/stdout
3. **Error Redirection** - Send errors to stderr
4. **Signal Handling** - Graceful shutdown on SIGTERM/SIGINT

### Connection Management

Implement robust connection handling:

1. **Session Management** - Track active MCP sessions
2. **Heartbeat/Ping** - Monitor connection health
3. **Reconnection Logic** - Handle client reconnections
4. **Resource Cleanup** - Clean up on client disconnect

### Load Balancing Considerations

For multiple MCP server instances:

1. **Session Affinity** - Route clients to same server instance
2. **Shared State** - Use Redis/database for session storage
3. **Health Checks** - Monitor MCP server instance health
4. **Graceful Failover** - Handle server instance failures

---

## Testing Strategy

### Unit Testing

Create tests for each component:

1. **Tool Tests** - Test each MCP tool individually
2. **Resource Tests** - Verify resource access and permissions  
3. **Transport Tests** - Test transport layer functionality
4. **Schema Tests** - Validate input/output schemas

### Integration Testing

Test end-to-end workflows:

1. **MCP Client Integration** - Test with actual MCP clients
2. **Provider Integration** - Verify provider routing still works
3. **Authentication Flow** - Test auth across MCP and REST
4. **Error Handling** - Verify error responses and recovery

### Performance Testing

Benchmark the MCP implementation:

1. **Throughput Testing** - Compare MCP vs REST API performance
2. **Connection Handling** - Test concurrent MCP connections
3. **Memory Usage** - Monitor memory consumption
4. **Response Times** - Measure latency impact

### Client Testing

Test with various MCP clients:

1. **Claude Desktop** - Local STDIO integration
2. **VSCode MCP** - HTTP transport integration  
3. **Custom Clients** - Build test clients for validation
4. **Curl/Postman** - HTTP transport testing

### Test Data and Scenarios

Create comprehensive test scenarios:

1. **Provider Failover** - Test provider switching via MCP
2. **Rate Limiting** - Verify rate limits work through MCP
3. **Authentication** - Test various auth scenarios
4. **Error Cases** - Test error handling and recovery
5. **Concurrent Usage** - Multi-client testing

---

## Deployment Considerations

### Production Deployment

#### Environment Configuration

Update production environment settings:

```bash
# Production MCP Settings
NODE_ENV=production
MCP_ENABLED=true
MCP_PORT=3001
MCP_TRANSPORTS=httpjson
MCP_HTTP_JSON_ENABLED=true
MCP_STDIO_ENABLED=false

# Security Settings
MCP_REQUIRE_AUTH=true
MCP_ALLOWED_ORIGINS=["https://claude.ai","https://code.visualstudio.com"]
MCP_SESSION_TIMEOUT=300000
MCP_MAX_CONNECTIONS=1000

# Performance Settings
MCP_ENABLE_COMPRESSION=true
MCP_MAX_MESSAGE_SIZE=10485760
MCP_HEARTBEAT_INTERVAL=30000
```

#### Infrastructure Updates

1. **Load Balancer Configuration**
   - Add MCP endpoints to load balancer rules
   - Configure session affinity if using stateful transport
   - Add health checks for MCP endpoints

2. **Firewall Rules**
   - Open MCP port (3001 or configured port)
   - Allow WebSocket connections if used
   - Configure security group rules for MCP traffic

3. **Monitoring and Logging**
   - Add MCP metrics to monitoring dashboard
   - Configure log aggregation for MCP events
   - Set up alerts for MCP service health

#### Docker Configuration

Update Docker configuration for MCP support:

```dockerfile
# Add MCP-specific environment variables
ENV MCP_ENABLED=true
ENV MCP_PORT=3001
ENV MCP_TRANSPORTS=httpjson

# Expose MCP port
EXPOSE 3001

# Health check for MCP
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/mcp/health || exit 1
```

### Kubernetes Deployment

For Kubernetes deployments:

1. **Service Configuration** - Expose MCP port
2. **ConfigMap Updates** - Add MCP configuration
3. **Pod Health Checks** - Add MCP health check probes
4. **Ingress Rules** - Route MCP traffic appropriately

### CDN and Reverse Proxy

Update Nginx/Apache configuration:

```nginx
# MCP endpoint configuration
location /mcp {
    proxy_pass http://backend:3001/mcp;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    
    # MCP-specific headers
    proxy_set_header X-MCP-Client-Id $http_x_mcp_client_id;
    proxy_set_header X-MCP-Session-Id $http_x_mcp_session_id;
    
    # Timeout settings for long-running operations
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 300s;
}
```

---

## Migration Strategy

### Backwards Compatibility

Ensure existing clients continue working:

1. **Dual Interface** - Run both REST API and MCP simultaneously
2. **Shared Logic** - Use same business logic for both interfaces
3. **Configuration Parity** - Ensure both interfaces have same capabilities
4. **Error Handling** - Maintain consistent error responses

### Gradual Rollout Plan

#### Phase 1: Internal Testing
- Deploy MCP to staging environment
- Test with development team
- Validate performance and functionality
- Fix any issues discovered

#### Phase 2: Beta Release
- Enable MCP for select users/clients
- Monitor performance and usage
- Gather feedback and iterate
- Document integration patterns

#### Phase 3: Full Release
- Enable MCP for all users
- Update documentation and examples
- Announce MCP availability
- Monitor adoption and performance

#### Phase 4: REST API Deprecation (Optional)
- Announce REST API deprecation timeline
- Provide migration tools and documentation
- Gradually phase out REST API support
- Maintain MCP as primary interface

### Client Migration Support

Help existing clients migrate:

1. **Migration Guides** - Detailed conversion instructions
2. **Compatibility Tools** - Scripts to convert REST calls to MCP
3. **Testing Support** - Test environments for validation
4. **Technical Support** - Direct assistance for complex migrations

### Data Migration

Handle any data changes required:

1. **Configuration Format** - Convert configs to MCP-compatible format
2. **User Data** - Migrate user preferences and settings
3. **API Key Format** - Update API key handling if needed
4. **Monitoring Data** - Ensure metrics continue working

---

## Troubleshooting

### Common Issues and Solutions

#### Connection Issues

**Problem:** MCP clients cannot connect to server
**Solutions:**
- Verify MCP port is open and accessible
- Check firewall rules and security groups
- Validate transport configuration
- Test with curl/telnet for basic connectivity

#### Authentication Failures

**Problem:** MCP tool calls fail with auth errors
**Solutions:**  
- Verify API key format and validation
- Check MCP auth middleware integration
- Validate client credential configuration
- Test authentication with known good credentials

#### Tool Execution Errors

**Problem:** MCP tools return errors or unexpected results
**Solutions:**
- Check tool schema validation
- Verify business logic integration
- Test tools individually in isolation
- Review error logs for specific failure causes

#### Performance Issues

**Problem:** MCP responses are slow or timing out
**Solutions:**
- Check provider response times
- Optimize tool execution logic
- Increase timeout settings
- Review connection pool configuration

### Debug Mode

Enable comprehensive debugging:

```bash
# Debug environment variables
DEBUG=mcp:*
MCP_LOG_LEVEL=debug
MCP_ENABLE_TRACE=true
LOG_LEVEL=debug

# Start with debug enabled
npm run dev:mcp
```

### Logging and Monitoring

Implement comprehensive logging:

1. **MCP Protocol Logs** - All MCP messages and responses
2. **Tool Execution Logs** - Individual tool call details
3. **Performance Metrics** - Response times and throughput
4. **Error Tracking** - Detailed error logs and stack traces
5. **Client Connection Logs** - Connection events and status

### Health Checks

Implement MCP-specific health checks:

1. **Transport Health** - Verify transport layers are responding
2. **Tool Health** - Test sample tool executions
3. **Resource Health** - Verify resource access is working
4. **Provider Health** - Check underlying provider connectivity
5. **Performance Health** - Monitor response times and throughput

---

## Resources and References

### MCP Documentation
- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [MCP Examples and Tutorials](https://github.com/modelcontextprotocol/examples)

### Implementation Examples
- [Hugging Face MCP Server](https://github.com/evalstate/hf-mcp-server) - Reference implementation
- [MCP Registry](https://github.com/mcp) - Community MCP servers
- [Claude MCP Integration](https://docs.claude.com/mcp) - Client integration guide

### Development Tools
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector) - Debug and test MCP servers
- [MCP Client Libraries](https://github.com/modelcontextprotocol/sdk) - Client development tools
- [JSON-RPC 2.0 Spec](https://www.jsonrpc.org/specification) - Underlying protocol specification

### Community Resources
- [MCP Discord Community](https://discord.gg/mcp) - Community support and discussion
- [MCP GitHub Discussions](https://github.com/modelcontextprotocol/sdk/discussions) - Technical discussions
- [Stack Overflow](https://stackoverflow.com/questions/tagged/model-context-protocol) - Q&A and troubleshooting

---

## Success Metrics

### Technical Metrics
- **MCP Response Times** - Target <500ms for tool calls
- **Concurrent Connections** - Support 1000+ simultaneous MCP clients
- **Error Rate** - Maintain <1% error rate for MCP operations
- **Uptime** - 99.9% availability for MCP endpoints

### Adoption Metrics
- **Client Integration** - Number of MCP clients successfully integrated
- **Tool Usage** - Frequency of MCP tool calls vs REST API calls
- **User Satisfaction** - Feedback scores from MCP users
- **Performance Improvement** - Speed/efficiency gains over REST API

### Business Metrics
- **Development Velocity** - Faster client integrations
- **Maintenance Overhead** - Reduced support burden
- **Feature Parity** - All REST features available via MCP
- **Future Readiness** - Positioned for MCP ecosystem growth

---

## Conclusion

Converting Your-PaL-MoE-v0.3 to an MCP server will significantly enhance its capabilities and future-proof the system for the evolving AI integration landscape. The dual-interface approach ensures backwards compatibility while enabling powerful new integration scenarios.

The implementation should be approached incrementally, validating each phase before proceeding. With proper planning and execution, this conversion will provide substantial value to both the development team and end users.

**Next Steps:**
1. Review this document with the development team
2. Set up development environment with MCP dependencies
3. Begin Phase 1 implementation with core MCP infrastructure
4. Establish testing procedures and success criteria
5. Plan deployment timeline and rollout strategy

**Questions or concerns? Reach out to the development team lead for clarification on any aspects of this conversion plan.**