#!/usr/bin/env node
/**
 * Model Profile Builder
 * Builds comprehensive model profiles from various sources
 * Integrates with HuggingFace API for enhanced model information
 */

const fs = require('fs').promises;
const path = require('path');
const { HuggingFaceAPI } = require('../csv-to-providers');
const { ModelProfileManager } = require('../schema/modelProfileSchema');

class ModelProfileBuilder {
    constructor() {
        this.hfAPI = new HuggingFaceAPI(process.env.HF_API_KEY);
        this.profileManager = new ModelProfileManager();
        this.cacheDir = path.join(__dirname, '..', 'cache');
        this.cacheFile = path.join(this.cacheDir, 'model_profiles.json');
    }

    /**
     * Build comprehensive model profiles
     */
    async buildProfiles() {
        console.log('🚀 Building model profiles...');
        
        // Ensure cache directory exists
        await fs.mkdir(this.cacheDir, { recursive: true });

        // Load existing profiles if available
        await this.loadExistingProfiles();

        // Build profiles from different sources
        await this.buildHuggingFaceProfiles();
        await this.buildOpenAIProfiles();
        await this.buildAnthropicProfiles();

        // Save profiles to cache
        await this.saveProfiles();

        // Generate summary
        this.generateSummary();
    }

    /**
     * Load existing profiles from cache
     */
    async loadExistingProfiles() {
        try {
            const data = await fs.readFile(this.cacheFile, 'utf8');
            const profileData = JSON.parse(data);
            const result = this.profileManager.importProfiles(profileData);
            console.log(`📂 Loaded ${result.imported} existing profiles from cache`);
        } catch (error) {
            console.log('📂 No existing profile cache found, starting fresh');
        }
    }

    /**
     * Build HuggingFace model profiles
     */
    async buildHuggingFaceProfiles() {
        console.log('🤗 Building HuggingFace model profiles...');
        
        try {
            // Get popular models from different categories
            const textModels = await this.hfAPI.getPopularTextModels(50);
            const embeddingModels = await this.hfAPI.getEmbeddingModels(20);
            const imageModels = await this.hfAPI.getImageModels(20);

            const allModels = [...textModels, ...embeddingModels, ...imageModels];
            
            for (const model of allModels) {
                try {
                    const profile = this.createHuggingFaceProfile(model);
                    this.profileManager.addProfile(profile);
                } catch (error) {
                    console.warn(`⚠️  Failed to create profile for ${model.id}:`, error.message);
                }
            }

            console.log(`✅ Built ${allModels.length} HuggingFace model profiles`);
        } catch (error) {
            console.error('❌ Failed to build HuggingFace profiles:', error.message);
        }
    }

    /**
     * Build OpenAI model profiles
     */
    async buildOpenAIProfiles() {
        console.log('🤖 Building OpenAI model profiles...');
        
        const openAIModels = [
            {
                id: 'gpt-4',
                name: 'GPT-4',
                capabilities: ['text-generation', 'conversation', 'reasoning'],
                parameters: { context_length: 8192, max_tokens: 4096 }
            },
            {
                id: 'gpt-4-turbo',
                name: 'GPT-4 Turbo',
                capabilities: ['text-generation', 'conversation', 'reasoning', 'long-context'],
                parameters: { context_length: 128000, max_tokens: 4096 }
            },
            {
                id: 'gpt-3.5-turbo',
                name: 'GPT-3.5 Turbo',
                capabilities: ['text-generation', 'conversation'],
                parameters: { context_length: 16384, max_tokens: 4096 }
            },
            {
                id: 'text-embedding-ada-002',
                name: 'Text Embedding Ada 002',
                capabilities: ['embeddings', 'similarity'],
                parameters: { dimensions: 1536 }
            },
            {
                id: 'dall-e-3',
                name: 'DALL-E 3',
                capabilities: ['image-generation'],
                parameters: { max_size: '1024x1024' }
            },
            {
                id: 'whisper-1',
                name: 'Whisper',
                capabilities: ['speech-to-text', 'transcription'],
                parameters: { languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'] }
            }
        ];

        for (const model of openAIModels) {
            const profile = this.createOpenAIProfile(model);
            this.profileManager.addProfile(profile);
        }

        console.log(`✅ Built ${openAIModels.length} OpenAI model profiles`);
    }

    /**
     * Build Anthropic model profiles
     */
    async buildAnthropicProfiles() {
        console.log('🧠 Building Anthropic model profiles...');
        
        const anthropicModels = [
            {
                id: 'claude-3-opus',
                name: 'Claude 3 Opus',
                capabilities: ['text-generation', 'conversation', 'reasoning', 'long-context'],
                parameters: { context_length: 200000, max_tokens: 4096 }
            },
            {
                id: 'claude-3-sonnet',
                name: 'Claude 3 Sonnet',
                capabilities: ['text-generation', 'conversation', 'reasoning'],
                parameters: { context_length: 200000, max_tokens: 4096 }
            },
            {
                id: 'claude-3-haiku',
                name: 'Claude 3 Haiku',
                capabilities: ['text-generation', 'conversation'],
                parameters: { context_length: 200000, max_tokens: 4096 }
            }
        ];

        for (const model of anthropicModels) {
            const profile = this.createAnthropicProfile(model);
            this.profileManager.addProfile(profile);
        }

        console.log(`✅ Built ${anthropicModels.length} Anthropic model profiles`);
    }

    /**
     * Create HuggingFace model profile
     */
    createHuggingFaceProfile(model) {
        const endpoint = this.inferEndpoint(model.capabilities);
        
        return {
            id: model.id,
            name: model.name || model.id,
            provider: 'huggingface',
            description: `HuggingFace model: ${model.id}`,
            capabilities: model.capabilities || [],
            pipeline_tag: model.pipeline_tag,
            tags: model.tags || [],
            parameters: {
                context_length: this.inferContextLength(model),
                languages: this.inferLanguages(model.tags)
            },
            metrics: {
                downloads: model.downloads || 0,
                likes: model.likes || 0
            },
            api: {
                endpoint: endpoint,
                method: 'POST',
                parameters: this.getEndpointParameters(endpoint)
            },
            provider_data: model.provider_data || {},
            indexed_at: new Date()
        };
    }

    /**
     * Create OpenAI model profile
     */
    createOpenAIProfile(model) {
        const endpoint = this.inferEndpoint(model.capabilities);
        
        return {
            id: model.id,
            name: model.name,
            provider: 'openai',
            description: `OpenAI model: ${model.name}`,
            capabilities: model.capabilities,
            parameters: model.parameters,
            api: {
                endpoint: endpoint,
                method: 'POST',
                parameters: this.getEndpointParameters(endpoint)
            },
            provider_data: {
                openai: {
                    official: true,
                    tier: 'production'
                }
            },
            indexed_at: new Date()
        };
    }

    /**
     * Create Anthropic model profile
     */
    createAnthropicProfile(model) {
        const endpoint = this.inferEndpoint(model.capabilities);
        
        return {
            id: model.id,
            name: model.name,
            provider: 'anthropic',
            description: `Anthropic model: ${model.name}`,
            capabilities: model.capabilities,
            parameters: model.parameters,
            api: {
                endpoint: endpoint,
                method: 'POST',
                parameters: this.getEndpointParameters(endpoint)
            },
            provider_data: {
                anthropic: {
                    official: true,
                    tier: 'production'
                }
            },
            indexed_at: new Date()
        };
    }

    /**
     * Infer endpoint from capabilities
     */
    inferEndpoint(capabilities = []) {
        const caps = new Set(capabilities.map(c => c.toLowerCase()));

        if (caps.has('embeddings')) return '/v1/embeddings';
        if (caps.has('image-generation')) return '/v1/images/generations';
        if (caps.has('speech-to-text')) return '/v1/audio/transcriptions';
        if (caps.has('text-to-speech')) return '/v1/audio/speech';
        if (caps.has('vision')) return '/v1/vision/analysis';
        
        return '/v1/chat/completions'; // Default
    }

    /**
     * Get endpoint parameters schema
     */
    getEndpointParameters(endpoint) {
        const baseParams = {
            temperature: { type: 'number', default: 0.7, min: 0, max: 2 },
            max_tokens: { type: 'number', default: 1000, min: 1, max: 4000 }
        };

        switch (endpoint) {
            case '/v1/chat/completions':
                return {
                    ...baseParams,
                    messages: { type: 'array', required: true },
                    stream: { type: 'boolean', default: false }
                };
            case '/v1/embeddings':
                return {
                    input: { type: 'string', required: true }
                };
            case '/v1/images/generations':
                return {
                    prompt: { type: 'string', required: true },
                    size: { type: 'string', default: '1024x1024' },
                    n: { type: 'number', default: 1, min: 1, max: 4 }
                };
            default:
                return baseParams;
        }
    }

    /**
     * Infer context length from model metadata
     */
    inferContextLength(model) {
        const id = model.id.toLowerCase();
        const tags = (model.tags || []).map(t => t.toLowerCase());
        
        // Check for explicit context length in tags
        for (const tag of tags) {
            const match = tag.match(/(\d+)k?-?context/);
            if (match) {
                return parseInt(match[1]) * (tag.includes('k') ? 1000 : 1);
            }
        }
        
        // Infer from model name
        if (id.includes('longformer')) return 4096;
        if (id.includes('bigbird')) return 4096;
        if (id.includes('gpt-4')) return 8192;
        if (id.includes('gpt-3.5')) return 4096;
        if (id.includes('claude')) return 100000;
        
        return 2048; // Default
    }

    /**
     * Infer supported languages from tags
     */
    inferLanguages(tags = []) {
        const languages = [];
        const tagStr = tags.join(' ').toLowerCase();
        
        if (tagStr.includes('multilingual')) {
            languages.push('en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh');
        } else if (tagStr.includes('english')) {
            languages.push('en');
        }
        
        // Check for specific language mentions
        const langMap = {
            'spanish': 'es',
            'french': 'fr', 
            'german': 'de',
            'italian': 'it',
            'portuguese': 'pt',
            'russian': 'ru',
            'japanese': 'ja',
            'korean': 'ko',
            'chinese': 'zh'
        };
        
        for (const [lang, code] of Object.entries(langMap)) {
            if (tagStr.includes(lang) && !languages.includes(code)) {
                languages.push(code);
            }
        }
        
        return languages.length > 0 ? languages : ['en']; // Default to English
    }

    /**
     * Save profiles to cache
     */
    async saveProfiles() {
        const data = this.profileManager.exportProfiles();
        await fs.writeFile(this.cacheFile, JSON.stringify(data, null, 2));
        console.log(`💾 Saved ${data.count} profiles to cache`);
    }

    /**
     * Generate summary report
     */
    generateSummary() {
        const stats = this.profileManager.getStats();
        
        console.log('\n📊 Model Profile Summary:');
        console.log(`   Total Profiles: ${stats.total_profiles}`);
        console.log(`   Providers: ${stats.providers}`);
        console.log(`   Capabilities: ${stats.capabilities}`);
        
        console.log('\n🏷️  Capability Distribution:');
        for (const [capability, count] of Object.entries(stats.capability_distribution)) {
            console.log(`   ${capability}: ${count}`);
        }
        
        console.log('\n🌐 Provider Distribution:');
        for (const [provider, count] of Object.entries(stats.provider_distribution)) {
            console.log(`   ${provider}: ${count}`);
        }
        
        console.log('\n✅ Model profile building complete!');
    }
}

// CLI execution
async function main() {
    const builder = new ModelProfileBuilder();
    await builder.buildProfiles();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ModelProfileBuilder;