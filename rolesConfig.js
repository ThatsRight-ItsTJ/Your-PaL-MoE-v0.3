/**
 * Provider and Model Configuration Manager
 * Manages provider configurations and model specifications
 * Handles model-to-tool mapping and registration
 */

const fs = require('fs').promises;
const path = require('path');

class RolesConfig {
    constructor() {
        this.providers = {};
        this.models = {};
        this.tools = {};
        this.configPath = path.join(__dirname, 'providers.json');
    }

    /**
     * Load provider configuration from providers.json
     */
    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            const config = JSON.parse(configData);
            
            this.providers = config.endpoints || {};
            this.generateModelMappings();
            this.registerTools();
            
            console.log(`[RolesConfig] Loaded configuration with ${Object.keys(this.models).length} models`);
            return config;
        } catch (error) {
            console.error('[RolesConfig] Failed to load configuration:', error.message);
            throw error;
        }
    }

    /**
     * Generate model mappings from provider configuration
     */
    generateModelMappings() {
        this.models = {};
        
        for (const [endpoint, endpointConfig] of Object.entries(this.providers)) {
            if (endpointConfig.models) {
                for (const [modelId, providers] of Object.entries(endpointConfig.models)) {
                    if (!this.models[modelId]) {
                        this.models[modelId] = {
                            id: modelId,
                            endpoint: endpoint,
                            providers: providers,
                            capabilities: this.inferCapabilities(modelId, endpoint)
                        };
                    }
                }
            }
        }
    }

    /**
     * Infer model capabilities based on model name and endpoint
     */
    inferCapabilities(modelId, endpoint) {
        const capabilities = [];
        const modelName = modelId.toLowerCase();
        
        // Infer from endpoint
        if (endpoint.includes('chat')) capabilities.push('text-generation', 'conversation');
        if (endpoint.includes('embeddings')) capabilities.push('embeddings', 'similarity');
        if (endpoint.includes('images')) capabilities.push('image-generation');
        if (endpoint.includes('audio')) capabilities.push('audio-processing');
        if (endpoint.includes('vision')) capabilities.push('vision', 'multimodal');
        
        // Infer from model name
        if (modelName.includes('gpt')) capabilities.push('text-generation', 'reasoning');
        if (modelName.includes('claude')) capabilities.push('text-generation', 'reasoning', 'long-context');
        if (modelName.includes('llama')) capabilities.push('text-generation', 'open-source');
        if (modelName.includes('embed')) capabilities.push('embeddings');
        if (modelName.includes('whisper')) capabilities.push('speech-to-text');
        if (modelName.includes('dall-e') || modelName.includes('stable-diffusion')) capabilities.push('image-generation');
        
        return [...new Set(capabilities)];
    }

    /**
     * Register each model as a Named Tool
     */
    registerTools() {
        this.tools = {};
        
        for (const [modelId, modelConfig] of Object.entries(this.models)) {
            this.tools[modelId] = {
                name: modelId,
                description: `AI model tool for ${modelId}`,
                endpoint: modelConfig.endpoint,
                providers: modelConfig.providers,
                capabilities: modelConfig.capabilities,
                parameters: this.getToolParameters(modelConfig.endpoint)
            };
        }
        
        console.log(`[RolesConfig] Registered ${Object.keys(this.tools).length} named tools`);
    }

    /**
     * Get tool parameters based on endpoint type
     */
    getToolParameters(endpoint) {
        const baseParams = {
            temperature: { type: 'number', default: 0.7, min: 0, max: 2 },
            max_tokens: { type: 'number', default: 1000, min: 1, max: 4000 }
        };

        if (endpoint.includes('chat')) {
            return {
                ...baseParams,
                messages: { type: 'array', required: true },
                stream: { type: 'boolean', default: false }
            };
        }

        if (endpoint.includes('embeddings')) {
            return {
                input: { type: 'string', required: true }
            };
        }

        if (endpoint.includes('images')) {
            return {
                prompt: { type: 'string', required: true },
                size: { type: 'string', default: '1024x1024' },
                n: { type: 'number', default: 1, min: 1, max: 4 }
            };
        }

        return baseParams;
    }

    /**
     * Get all available tools
     */
    getTools() {
        return this.tools;
    }

    /**
     * Get specific tool by name
     */
    getTool(name) {
        return this.tools[name];
    }

    /**
     * Get models by capability
     */
    getModelsByCapability(capability) {
        return Object.values(this.models).filter(model => 
            model.capabilities.includes(capability)
        );
    }

    /**
     * Get provider configuration for a model
     */
    getProviderConfig(modelId) {
        const model = this.models[modelId];
        if (!model || !model.providers || model.providers.length === 0) {
            return null;
        }
        
        // Return the highest priority provider
        return model.providers.sort((a, b) => (a.priority || 99) - (b.priority || 99))[0];
    }
}

module.exports = RolesConfig;