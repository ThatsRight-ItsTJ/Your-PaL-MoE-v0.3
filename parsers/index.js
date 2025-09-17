/**
 * Pluggable Parser System
 * Extensible parsing framework for different model providers
 * Handles OpenAI, Anthropic, HuggingFace, and other providers
 */

class ProviderParsers {
    constructor() {
        this.parsers = {
            openai: new OpenAIParser(),
            anthropic: new AnthropicParser(),
            huggingface: new HuggingFaceParser(),
            generic: new GenericParser()
        };
    }

    /**
     * Get appropriate parser for a provider
     */
    getParser(providerName) {
        const name = providerName.toLowerCase();
        
        if (name.includes('openai')) return this.parsers.openai;
        if (name.includes('anthropic') || name.includes('claude')) return this.parsers.anthropic;
        if (name.includes('huggingface') || name.includes('hf')) return this.parsers.huggingface;
        
        return this.parsers.generic;
    }

    /**
     * Parse response based on provider
     */
    parseResponse(providerName, response, context = {}) {
        const parser = this.getParser(providerName);
        return parser.parse(response, context);
    }

    /**
     * Parse model list based on provider
     */
    parseModelList(providerName, modelData, context = {}) {
        const parser = this.getParser(providerName);
        return parser.parseModelList(modelData, context);
    }
}

/**
 * OpenAI Parser
 */
class OpenAIParser {
    parse(response, context = {}) {
        // Standard OpenAI response format
        if (response.choices && Array.isArray(response.choices)) {
            return {
                content: response.choices[0]?.message?.content || response.choices[0]?.text,
                usage: response.usage,
                model: response.model,
                finish_reason: response.choices[0]?.finish_reason,
                raw: response
            };
        }

        // Embeddings response
        if (response.data && Array.isArray(response.data)) {
            return {
                embeddings: response.data,
                usage: response.usage,
                model: response.model,
                raw: response
            };
        }

        return { raw: response };
    }

    parseModelList(modelData, context = {}) {
        if (modelData.data && Array.isArray(modelData.data)) {
            return modelData.data.map(model => ({
                id: model.id,
                object: model.object,
                created: model.created,
                owned_by: model.owned_by,
                capabilities: this.inferCapabilities(model.id)
            }));
        }

        return [];
    }

    inferCapabilities(modelId) {
        const capabilities = [];
        const id = modelId.toLowerCase();
        
        if (id.includes('gpt')) capabilities.push('text-generation', 'conversation');
        if (id.includes('embedding')) capabilities.push('embeddings');
        if (id.includes('dall-e')) capabilities.push('image-generation');
        if (id.includes('whisper')) capabilities.push('speech-to-text');
        if (id.includes('tts')) capabilities.push('text-to-speech');
        
        return capabilities;
    }
}

/**
 * Anthropic Parser
 */
class AnthropicParser {
    parse(response, context = {}) {
        // Anthropic response format
        if (response.content && Array.isArray(response.content)) {
            return {
                content: response.content[0]?.text,
                usage: response.usage,
                model: response.model,
                stop_reason: response.stop_reason,
                raw: response
            };
        }

        return { raw: response };
    }

    parseModelList(modelData, context = {}) {
        // Anthropic doesn't have a public models endpoint
        // This would be populated from known models
        return [];
    }
}

/**
 * HuggingFace Parser
 */
class HuggingFaceParser {
    parse(response, context = {}) {
        // HuggingFace Inference API response formats vary
        if (Array.isArray(response)) {
            // Text generation response
            if (response[0]?.generated_text) {
                return {
                    content: response[0].generated_text,
                    raw: response
                };
            }
            
            // Embeddings response
            if (typeof response[0] === 'number') {
                return {
                    embeddings: response,
                    raw: response
                };
            }
        }

        // Single object response
        if (response.generated_text) {
            return {
                content: response.generated_text,
                raw: response
            };
        }

        return { raw: response };
    }

    parseModelList(modelData, context = {}) {
        if (Array.isArray(modelData)) {
            return modelData.map(model => ({
                id: model.id || model.modelId,
                pipeline_tag: model.pipeline_tag,
                tags: model.tags || [],
                downloads: model.downloads,
                likes: model.likes,
                capabilities: this.inferCapabilitiesFromTags(model.pipeline_tag, model.tags)
            }));
        }

        return [];
    }

    inferCapabilitiesFromTags(pipelineTag, tags = []) {
        const capabilities = [];
        
        if (pipelineTag) {
            switch (pipelineTag) {
                case 'text-generation':
                    capabilities.push('text-generation', 'conversation');
                    break;
                case 'text2text-generation':
                    capabilities.push('text-generation', 'translation');
                    break;
                case 'feature-extraction':
                    capabilities.push('embeddings');
                    break;
                case 'text-to-image':
                    capabilities.push('image-generation');
                    break;
                case 'automatic-speech-recognition':
                    capabilities.push('speech-to-text');
                    break;
                case 'text-to-speech':
                    capabilities.push('text-to-speech');
                    break;
                case 'image-to-text':
                    capabilities.push('vision', 'image-understanding');
                    break;
            }
        }

        // Infer from tags
        tags.forEach(tag => {
            const tagLower = tag.toLowerCase();
            if (tagLower.includes('conversational')) capabilities.push('conversation');
            if (tagLower.includes('multilingual')) capabilities.push('multilingual');
            if (tagLower.includes('code')) capabilities.push('code-generation');
        });

        return [...new Set(capabilities)];
    }
}

/**
 * Generic Parser
 */
class GenericParser {
    parse(response, context = {}) {
        // Try to extract common patterns
        if (response.choices) {
            return new OpenAIParser().parse(response, context);
        }

        if (response.content) {
            return new AnthropicParser().parse(response, context);
        }

        if (response.generated_text || Array.isArray(response)) {
            return new HuggingFaceParser().parse(response, context);
        }

        // Fallback to raw response
        return { raw: response };
    }

    parseModelList(modelData, context = {}) {
        // Try different formats
        if (modelData.data) {
            return new OpenAIParser().parseModelList(modelData, context);
        }

        if (Array.isArray(modelData)) {
            return new HuggingFaceParser().parseModelList(modelData, context);
        }

        return [];
    }
}

module.exports = ProviderParsers;