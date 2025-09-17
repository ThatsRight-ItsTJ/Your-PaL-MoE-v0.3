/**
 * Tool Registration and Execution Manager
 * Implements API protocol for tool registration and execution
 * Handles tool discovery and method routing
 */

const EventEmitter = require('events');
const RolesConfig = require('./rolesConfig');

class TaskMaster extends EventEmitter {
    constructor() {
        super();
        this.rolesConfig = new RolesConfig();
        this.registeredTools = {};
        this.executionHistory = [];
        this.isInitialized = false;
    }

    /**
     * Initialize the TaskMaster
     */
    async initialize() {
        try {
            await this.rolesConfig.loadConfig();
            this.registerAllTools();
            this.isInitialized = true;
            this.emit('initialized');
            console.log('[TaskMaster] Initialized successfully');
        } catch (error) {
            console.error('[TaskMaster] Initialization failed:', error.message);
            throw error;
        }
    }

    /**
     * Register all available tools from configuration
     */
    registerAllTools() {
        const tools = this.rolesConfig.getTools();
        
        for (const [toolName, toolConfig] of Object.entries(tools)) {
            this.registerTool(toolName, toolConfig);
        }
        
        console.log(`[TaskMaster] Registered ${Object.keys(this.registeredTools).length} tools`);
    }

    /**
     * Register a single tool
     */
    registerTool(name, config) {
        this.registeredTools[name] = {
            ...config,
            registeredAt: new Date().toISOString(),
            callCount: 0,
            lastCalled: null
        };
        
        this.emit('toolRegistered', { name, config });
    }

    /**
     * Get all registered tools
     */
    listTools() {
        return Object.keys(this.registeredTools).map(name => ({
            name,
            description: this.registeredTools[name].description,
            capabilities: this.registeredTools[name].capabilities,
            parameters: this.registeredTools[name].parameters
        }));
    }

    /**
     * Get specific tool information
     */
    getTool(name) {
        return this.registeredTools[name];
    }

    /**
     * Execute a tool call
     */
    async executeTool(toolName, parameters = {}, options = {}) {
        if (!this.isInitialized) {
            throw new Error('TaskMaster not initialized');
        }

        const tool = this.registeredTools[toolName];
        if (!tool) {
            throw new Error(`Tool '${toolName}' not found`);
        }

        // Validate parameters
        this.validateParameters(tool.parameters, parameters);

        // Get provider configuration
        const providerConfig = this.rolesConfig.getProviderConfig(toolName);
        if (!providerConfig) {
            throw new Error(`No provider configuration found for tool '${toolName}'`);
        }

        // Create execution context
        const executionId = this.generateExecutionId();
        const context = {
            executionId,
            toolName,
            parameters,
            options,
            providerConfig,
            startTime: Date.now()
        };

        try {
            // Update tool statistics
            tool.callCount++;
            tool.lastCalled = new Date().toISOString();

            // Execute the tool
            const result = await this.executeToolWithProvider(context);

            // Record execution
            this.recordExecution(context, result, null);

            this.emit('toolExecuted', { context, result });
            return result;

        } catch (error) {
            // Record failed execution
            this.recordExecution(context, null, error);
            this.emit('toolExecutionFailed', { context, error });
            throw error;
        }
    }

    /**
     * Execute tool with provider
     */
    async executeToolWithProvider(context) {
        const { toolName, parameters, providerConfig } = context;
        const tool = this.registeredTools[toolName];

        // Prepare request based on endpoint type
        const requestData = this.prepareRequest(tool.endpoint, parameters, providerConfig);

        // Make the API call
        const fetch = await import('node-fetch');
        const targetUrl = `${providerConfig.base_url.replace(/\/+$/, '')}${tool.endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Your-PaL-MoE/0.3',
            'Accept': '*/*'
        };

        if (providerConfig.api_key && !providerConfig.base_url.includes('/api/openai')) {
            headers['Authorization'] = `Bearer ${providerConfig.api_key}`;
        }

        const response = await fetch.default(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestData),
            timeout: 120000
        });

        if (!response.ok) {
            throw new Error(`Provider API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        return this.formatResponse(tool.endpoint, result, context);
    }

    /**
     * Prepare request data based on endpoint type
     */
    prepareRequest(endpoint, parameters, providerConfig) {
        const requestData = { ...parameters };
        
        // Set the correct model name for the provider
        requestData.model = providerConfig.model;

        return requestData;
    }

    /**
     * Format response based on endpoint type
     */
    formatResponse(endpoint, result, context) {
        return {
            toolName: context.toolName,
            executionId: context.executionId,
            result,
            metadata: {
                endpoint,
                provider: context.providerConfig.provider_name,
                executionTime: Date.now() - context.startTime
            }
        };
    }

    /**
     * Validate tool parameters
     */
    validateParameters(parameterSchema, parameters) {
        if (!parameterSchema) return;

        for (const [paramName, schema] of Object.entries(parameterSchema)) {
            const value = parameters[paramName];

            if (schema.required && (value === undefined || value === null)) {
                throw new Error(`Required parameter '${paramName}' is missing`);
            }

            if (value !== undefined && schema.type) {
                const actualType = Array.isArray(value) ? 'array' : typeof value;
                if (actualType !== schema.type) {
                    throw new Error(`Parameter '${paramName}' must be of type ${schema.type}, got ${actualType}`);
                }
            }
        }
    }

    /**
     * Generate unique execution ID
     */
    generateExecutionId() {
        return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Record execution in history
     */
    recordExecution(context, result, error) {
        const record = {
            ...context,
            endTime: Date.now(),
            success: !error,
            error: error ? error.message : null,
            resultSize: result ? JSON.stringify(result).length : 0
        };

        this.executionHistory.push(record);

        // Keep only last 1000 executions
        if (this.executionHistory.length > 1000) {
            this.executionHistory = this.executionHistory.slice(-1000);
        }
    }

    /**
     * Get execution statistics
     */
    getStats() {
        const totalExecutions = this.executionHistory.length;
        const successfulExecutions = this.executionHistory.filter(e => e.success).length;
        const failedExecutions = totalExecutions - successfulExecutions;

        const toolStats = {};
        for (const [toolName, tool] of Object.entries(this.registeredTools)) {
            toolStats[toolName] = {
                callCount: tool.callCount,
                lastCalled: tool.lastCalled
            };
        }

        return {
            totalExecutions,
            successfulExecutions,
            failedExecutions,
            successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
            toolStats,
            registeredToolsCount: Object.keys(this.registeredTools).length
        };
    }

    /**
     * Reload configuration
     */
    async reload() {
        console.log('[TaskMaster] Reloading configuration...');
        await this.rolesConfig.loadConfig();
        this.registeredTools = {};
        this.registerAllTools();
        this.emit('reloaded');
    }
}

module.exports = TaskMaster;