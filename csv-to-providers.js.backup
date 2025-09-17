#!/usr/bin/env node
/**
 * Enhanced CSV → providers.json generator with HuggingFace API integration
 * - HuggingFace model search and capability detection
 * - Model fetching (URL or delimited list)
 * - Endpoint inference (chat, embeddings, images, audio, vision)
 * - Hot reload (file watcher with debounce)
 *
 * Env vars:
 *   CSV_PATH=./providers.csv
 *   OUTPUT_PATH=./providers.json
 *   WATCH=1 (enable hot reload)
 *   LOG_LEVEL=info | warn | error | debug
 *   TIMEOUT_MS=12000
 *   RETRIES=2
 *   CONCURRENCY=6
 *   HF_API_KEY=your_huggingface_api_key
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const { setTimeout: delay } = require('timers/promises');

// Use node-fetch for HTTP requests
let fetch;
(async () => {
  const nodeFetch = await import('node-fetch');
  fetch = nodeFetch.default;
})();

/* ------------------------------ Config ------------------------------ */

const CSV_PATH = process.env.CSV_PATH || path.resolve(process.cwd(), 'providers.csv');
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.resolve(process.cwd(), 'providers.json');
const WATCH = process.env.WATCH === '1' || process.env.WATCH === 'true';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 12000);
const RETRIES = Number(process.env.RETRIES || 2);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 6));
const HF_API_KEY = process.env.HF_API_KEY || '';

/* ------------------------------ Logger ------------------------------ */

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
function log(level, ...args) {
  if (levels[level] <= (levels[LOG_LEVEL] ?? 2)) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}

/* ------------------------------ Utilities ------------------------------ */

function isURL(str) {
  return typeof str === 'string' && /^https?:\/\//i.test(str.trim());
}

function cleanString(s) {
  return (s ?? '').toString().trim();
}

function parseNumber(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Parse rate limit/cost information from CSV column
 */
function parseRateLimitCostInfo(infoStr) {
  if (!infoStr || typeof infoStr !== 'string') {
    return {
      is_free: false,
      daily_limit: null,
      rate_limit: null,
      cost_per_token: null,
      cost_type: 'unknown'
    };
  }
  
  const info = infoStr.toLowerCase().trim();
  const result = {
    is_free: false,
    daily_limit: null,
    rate_limit: null,
    cost_per_token: null,
    cost_type: 'unknown'
  };
  
  // Check for free indicators
  if (info.includes('free') || info.includes('no cost') || info.includes('0')) {
    result.is_free = true;
  }
  
  // Extract daily limits
  const dailyLimitMatch = info.match(/(\d+)\s*(per day|daily|day)/i);
  if (dailyLimitMatch) {
    result.daily_limit = parseInt(dailyLimitMatch[1]);
  }
  
  // Extract rate limits (requests per minute/second)
  const rateLimitMatch = info.match(/(\d+)\s*(per minute|per second|requests\/?s?|r\/?s?)/i);
  if (rateLimitMatch) {
    const value = parseInt(rateLimitMatch[1]);
    const unit = rateLimitMatch[2].toLowerCase();
    
    if (unit.includes('minute')) {
      result.rate_limit = { value, unit: 'per_minute' };
    } else if (unit.includes('second')) {
      result.rate_limit = { value, unit: 'per_second' };
    }
  }
  
  // Extract cost information
  const costMatch = info.match(/(\d+\.?\d*)\s*(credits?|tokens?|dollars?|\$)/i);
  if (costMatch) {
    result.cost_per_token = parseFloat(costMatch[1]);
    result.cost_type = costMatch[2].toLowerCase();
  }
  
  // Check for specific free model indicators
  if (info.includes('price multiplier of 0.001') || info.includes('0.001')) {
    result.cost_per_token = 0.001;
    result.cost_type = 'multiplier';
    result.is_free = true;
  }
  
  return result;
}

function normalizeModelId(raw) {
  if (!raw) return '';
  let m = cleanString(raw);

  // Drop query/fragment
  m = m.replace(/[?#].*$/, '');

  // Common qualifiers like ":free"
  m = m.replace(/:free$/i, '');

  // If it's a namespaced id like "org/model", keep full format for HF models
  if (m.includes('/') && !m.includes('://')) {
    return m; // Keep HuggingFace format like "microsoft/DialoGPT-medium"
  }

  // If it's a URL, extract model name
  if (m.includes('://')) {
    try {
      const u = new URL(m);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length) m = parts[parts.length - 1];
    } catch { /* noop */ }
  } else {
    // Trim known prefixes like "models/" or trailing slashes
    m = m.replace(/^models\//i, '').replace(/\/$/, '');
  }

  return m;
}

/**
 * Search HuggingFace by model name to get detailed capabilities
 */
async function searchHuggingFaceByModelName(modelName) {
  if (!HF_API_KEY) {
    log('debug', `No HF_API_KEY, using pattern matching for: ${modelName}`);
    return inferCapabilitiesFromModelName(modelName);
  }
  
  log('debug', `Searching HuggingFace for model: ${modelName}`);
  const hfAPI = new HuggingFaceAPI(HF_API_KEY);
  
  try {
    // Search for the model on HuggingFace
    const results = await hfAPI.searchModels(modelName, { limit: 1 });
    
    if (results.length > 0) {
      const model = results[0];
      log('debug', `Found HuggingFace model: ${model.id} with score: ${model.score || 'N/A'}`);
      
      // Get detailed capabilities
      const details = await hfAPI.getModelDetails(model.id);
      
      return {
        id: model.id,
        capabilities: details?.capabilities || inferCapabilitiesFromModelName(modelName),
        meta: {
          type: 'huggingface-search',
          confidence: model.score || 0.8,
          original: modelName,
          huggingface_data: details
        }
      };
    } else {
      log('debug', `No HuggingFace models found for: ${modelName}`);
    }
  } catch (error) {
    log('debug', `HuggingFace search failed for ${modelName}:`, error.message);
  }
  
  // Fallback to pattern matching
  log('debug', `Using pattern matching fallback for: ${modelName}`);
  return inferCapabilitiesFromModelName(modelName);
}

/**
 * Infer capabilities from model name alone
 */
function inferCapabilitiesFromModelName(modelName = '') {
  const capabilities = [];
  const nameLower = modelName.toLowerCase();
  
  // Check for specific model patterns
  if (nameLower.includes('gpt') || nameLower.includes('claude') || nameLower.includes('llama')) {
    capabilities.push('text-generation', 'conversation');
  }
  
  if (nameLower.includes('embedding') || nameLower.includes('bert') || nameLower.includes('text-embedding')) {
    capabilities.push('embeddings', 'similarity');
  }
  
  if (nameLower.includes('dalle') || nameLower.includes('image') || nameLower.includes('stable-diffusion') || nameLower.includes('flux')) {
    capabilities.push('image-generation');
  }
  
  if (nameLower.includes('whisper') || nameLower.includes('speech') || nameLower.includes('audio')) {
    capabilities.push('speech-to-text', 'transcription');
  }
  
  if (nameLower.includes('vision') || nameLower.includes('clip') || nameLower.includes('multimodal')) {
    capabilities.push('vision', 'image-understanding');
  }
  
  // Default to text generation for unknown models
  if (capabilities.length === 0) {
    capabilities.push('text-generation');
  }
  
  return capabilities;
}

/* ------------------------------ HuggingFace API Integration ------------------------------ */

class HuggingFaceAPI {
  constructor(apiKey = '') {
    this.apiKey = apiKey;
    this.baseUrl = 'https://huggingface.co/api';
    this.headers = {
      'User-Agent': 'Your-PaL-MoE/0.3',
      'Accept': 'application/json'
    };
    
    if (this.apiKey) {
      this.headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
  }

  /**
   * Search models on HuggingFace
   */
  async searchModels(query = '', options = {}) {
    const params = new URLSearchParams({
      search: query,
      limit: options.limit || 100,
      sort: options.sort || 'downloads',
      direction: options.direction || -1,
      ...options.filters
    });

    const url = `${this.baseUrl}/models?${params}`;
    
    try {
      const response = await this.httpGet(url);
      return this.parseModelSearchResults(response);
    } catch (error) {
      log('error', `HuggingFace model search failed:`, error.message);
      return [];
    }
  }

  /**
   * Get model details
   */
  async getModelDetails(modelId) {
    const url = `${this.baseUrl}/models/${modelId}`;
    
    try {
      const response = await this.httpGet(url);
      return this.parseModelDetails(response);
    } catch (error) {
      log('warn', `Failed to get details for model ${modelId}:`, error.message);
      return null;
    }
  }

  /**
   * Get models by pipeline tag
   */
  async getModelsByPipeline(pipelineTag, limit = 50) {
    return await this.searchModels('', {
      limit,
      filters: { pipeline_tag: pipelineTag }
    });
  }

  /**
   * Get popular models for text generation
   */
  async getPopularTextModels(limit = 20) {
    return await this.getModelsByPipeline('text-generation', limit);
  }

  /**
   * Get embedding models
   */
  async getEmbeddingModels(limit = 20) {
    return await this.getModelsByPipeline('feature-extraction', limit);
  }

  /**
   * Get image generation models
   */
  async getImageModels(limit = 20) {
    return await this.getModelsByPipeline('text-to-image', limit);
  }

  /**
   * HTTP GET with retries
   */
  async httpGet(url) {
    let lastErr;
    const maxDelay = 30000;
    const baseDelay = 1000;
    
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          headers: this.headers,
          timeout: TIMEOUT_MS
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (err) {
        lastErr = err;
        
        if (attempt < RETRIES) {
          const delayMs = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
          const jitter = Math.random() * 1000;
          const totalDelay = delayMs + jitter;
          
          log('warn', `HF API request failed (attempt ${attempt + 1}/${RETRIES + 1}):`, err.message);
          await delay(totalDelay);
        }
      }
    }
    
    throw lastErr;
  }

  /**
   * Parse model search results
   */
  parseModelSearchResults(data) {
    if (!Array.isArray(data)) return [];

    return data.map(model => ({
      id: model.id || model.modelId,
      name: model.id || model.modelId,
      pipeline_tag: model.pipeline_tag,
      tags: model.tags || [],
      downloads: model.downloads || 0,
      likes: model.likes || 0,
      created_at: model.created_at,
      last_modified: model.last_modified,
      capabilities: this.inferCapabilities(model),
      provider_data: {
        huggingface: {
          author: model.author,
          sha: model.sha,
          private: model.private,
          gated: model.gated
        }
      }
    }));
  }

  /**
   * Parse model details
   */
  parseModelDetails(model) {
    return {
      id: model.id || model.modelId,
      name: model.id || model.modelId,
      description: model.description,
      pipeline_tag: model.pipeline_tag,
      tags: model.tags || [],
      downloads: model.downloads || 0,
      likes: model.likes || 0,
      created_at: model.created_at,
      last_modified: model.last_modified,
      capabilities: this.inferCapabilities(model),
      config: model.config,
      provider_data: {
        huggingface: model
      }
    };
  }

  /**
   * Infer model capabilities from HuggingFace metadata
   */
  inferCapabilities(model) {
    const capabilities = [];
    const pipelineTag = model.pipeline_tag;
    const tags = model.tags || [];
    const modelId = (model.id || '').toLowerCase();

    // Pipeline tag based capabilities
    switch (pipelineTag) {
      case 'text-generation':
        capabilities.push('text-generation', 'conversation');
        break;
      case 'text2text-generation':
        capabilities.push('text-generation', 'translation', 'summarization');
        break;
      case 'feature-extraction':
        capabilities.push('embeddings', 'similarity');
        break;
      case 'text-to-image':
        capabilities.push('image-generation');
        break;
      case 'image-to-text':
        capabilities.push('vision', 'image-understanding', 'ocr');
        break;
      case 'automatic-speech-recognition':
        capabilities.push('speech-to-text', 'transcription');
        break;
      case 'text-to-speech':
        capabilities.push('text-to-speech', 'voice-synthesis');
        break;
      case 'conversational':
        capabilities.push('conversation', 'chatbot');
        break;
      case 'question-answering':
        capabilities.push('question-answering', 'reasoning');
        break;
      case 'summarization':
        capabilities.push('summarization', 'text-processing');
        break;
      case 'translation':
        capabilities.push('translation', 'multilingual');
        break;
      case 'fill-mask':
        capabilities.push('text-completion', 'language-modeling');
        break;
    }

    // Tag based capabilities
    tags.forEach(tag => {
      const tagLower = tag.toLowerCase();
      if (tagLower.includes('multilingual')) capabilities.push('multilingual');
      if (tagLower.includes('code')) capabilities.push('code-generation', 'programming');
      if (tagLower.includes('instruct')) capabilities.push('instruction-following');
      if (tagLower.includes('chat')) capabilities.push('conversation');
      if (tagLower.includes('reasoning')) capabilities.push('reasoning');
      if (tagLower.includes('math')) capabilities.push('mathematical-reasoning');
      if (tagLower.includes('vision')) capabilities.push('vision', 'multimodal');
    });

    // Model name based capabilities
    if (modelId.includes('gpt')) capabilities.push('text-generation', 'conversation');
    if (modelId.includes('bert')) capabilities.push('embeddings', 'classification');
    if (modelId.includes('t5')) capabilities.push('text-generation', 'translation');
    if (modelId.includes('whisper')) capabilities.push('speech-to-text');
    if (modelId.includes('stable-diffusion')) capabilities.push('image-generation');
    if (modelId.includes('clip')) capabilities.push('vision', 'multimodal');

    return [...new Set(capabilities)];
  }
}

/* ------------------------------ Endpoint inference ------------------------------ */

const ENDPOINTS = {
  CHAT: '/v1/chat/completions',
  EMBED: '/v1/embeddings',
  IMAGE: '/v1/images/generations',
  AUDIO_STT: '/v1/audio/transcriptions',
  AUDIO_TTS: '/v1/audio/speech',
  VISION: '/v1/vision/analysis',
};

function inferEndpointFromCapabilities(capabilities = []) {
  const caps = new Set(capabilities.map(c => c.toLowerCase()));

  if (caps.has('embeddings') || caps.has('similarity')) return ENDPOINTS.EMBED;
  if (caps.has('image-generation')) return ENDPOINTS.IMAGE;
  if (caps.has('speech-to-text') || caps.has('transcription')) return ENDPOINTS.AUDIO_STT;
  if (caps.has('text-to-speech') || caps.has('voice-synthesis')) return ENDPOINTS.AUDIO_TTS;
  if (caps.has('vision') || caps.has('multimodal') || caps.has('image-understanding')) return ENDPOINTS.VISION;
  if (caps.has('text-generation') || caps.has('conversation') || caps.has('chatbot')) return ENDPOINTS.CHAT;

  return ENDPOINTS.CHAT; // Default
}

function inferEndpointFromName(modelName = '') {
  const n = cleanString(modelName).toLowerCase();

  // Embeddings
  if (/\b(embed|embedding|vector|bert|sentence)/.test(n)) return ENDPOINTS.EMBED;

  // Image generation
  if (/\b(image|images|img|dalle|sd|stable|diffusion|flux|sdxl)/.test(n)) return ENDPOINTS.IMAGE;

  // Audio STT
  if (/\b(whisper|transcribe|speech2text|speech-to-text|asr)/.test(n)) return ENDPOINTS.AUDIO_STT;

  // Audio TTS
  if (/\b(tts|text2speech|text-to-speech|voice)/.test(n)) return ENDPOINTS.AUDIO_TTS;

  // Vision / multimodal
  if (/\b(vision|clip|blip|ocr|multimodal|vlm)/.test(n)) return ENDPOINTS.VISION;

  // Default to chat
  return ENDPOINTS.CHAT;
}

function chooseEndpoint({ forceEndpoint, modelName, capabilities, meta }) {
  if (forceEndpoint && ENDPOINTS_MAP[forceEndpoint]) return ENDPOINTS_MAP[forceEndpoint];
  
  // Try capabilities first
  if (capabilities && capabilities.length > 0) {
    const fromCapabilities = inferEndpointFromCapabilities(capabilities);
    if (fromCapabilities) return fromCapabilities;
  }
  
  return inferEndpointFromName(modelName);
}

const ENDPOINTS_MAP = {
  '/v1/chat/completions': ENDPOINTS.CHAT,
  '/v1/embeddings': ENDPOINTS.EMBED,
  '/v1/images/generations': ENDPOINTS.IMAGE,
  '/v1/audio/transcriptions': ENDPOINTS.AUDIO_STT,
  '/v1/audio/speech': ENDPOINTS.AUDIO_TTS,
  '/v1/vision/analysis': ENDPOINTS.VISION,
  chat: ENDPOINTS.CHAT,
  embeddings: ENDPOINTS.EMBED,
  images: ENDPOINTS.IMAGE,
  image: ENDPOINTS.IMAGE,
  audio_stt: ENDPOINTS.AUDIO_STT,
  audio_tts: ENDPOINTS.AUDIO_TTS,
  vision: ENDPOINTS.VISION,
};

/* ------------------------------ HTTP fetch with retries ------------------------------ */

async function httpGet(url, headers = {}, timeout = TIMEOUT_MS, retries = RETRIES) {
  let lastErr;
  const maxDelay = 30000;
  const baseDelay = 1000;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers, timeout });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      const isRetryable = !status ||
                         (status >= 500 && status < 600) ||
                         err.code === 'ECONNABORTED' ||
                         err.code === 'ETIMEDOUT' ||
                         err.code === 'ENOTFOUND' ||
                         err.code === 'ECONNREFUSED';
      
      const delayMs = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 1000;
      const totalDelay = delayMs + jitter;
      
      log('warn', `GET ${url} failed (attempt ${attempt + 1}/${retries + 1})`,
          status || err.code || err.message,
          `Retrying in ${Math.round(totalDelay / 1000)}s...`);
      
      if (attempt < retries && isRetryable) {
        await delay(totalDelay);
        continue;
      }
      break;
    }
  }
  
  log('error', `Final failure for ${url} after ${retries + 1} attempts:`,
      lastErr?.response?.status ? `HTTP ${lastErr.response.status}` : lastErr?.code || 'Unknown error',
      lastErr?.message || 'No error message available');
  
  throw lastErr;
}

/* ------------------------------ Concurrency limiter ------------------------------ */

function pLimit(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    active--;
    if (queue.length > 0) {
      const fn = queue.shift();
      fn();
    }
  };
  return function run(fn) {
    return new Promise((resolve, reject) => {
      const exec = () => {
        active++;
        fn().then((v) => {
          next();
          resolve(v);
        }, (e) => {
          next();
          reject(e);
        });
      };
      if (active < limit) exec();
      else queue.push(exec);
    });
  };
}

const limit = pLimit(CONCURRENCY);

/* ------------------------------ Model extraction ------------------------------ */

function extractModelsFromResponse(data, isHuggingFace = false) {
  const candidates = [];

  if (isHuggingFace) {
    // Use HuggingFace API parser
    const hfAPI = new HuggingFaceAPI();
    return hfAPI.parseModelSearchResults(Array.isArray(data) ? data : [data]);
  }

  function collect(arr) {
    for (const item of arr) {
      if (!item) continue;
      if (typeof item === 'string') {
        candidates.push({ id: item });
      } else if (typeof item === 'object') {
        const id = item.id || item.name || item.model || '';
        candidates.push({
          id,
          type: item.type,
          capabilities: item.capabilities || item.capability || [],
          tags: item.tags || item.label || [],
          raw: item,
        });
      }
    }
  }

  if (Array.isArray(data)) {
    collect(data);
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.models)) collect(data.models);
    else if (Array.isArray(data.data)) collect(data.data);
    else if (Array.isArray(data.items)) collect(data.items);
    else if (data.result && Array.isArray(data.result.models)) collect(data.result.models);
  }

  return candidates
    .map(m => ({
      id: normalizeModelId(m.id),
      capabilities: m.capabilities || [],
      meta: { type: m.type, capabilities: m.capabilities, tags: m.tags, raw: m.raw },
    }))
    .filter(m => !!m.id);
}

/* ------------------------------ CSV parsing & generation ------------------------------ */

async function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .on('error', reject)
      .pipe(csvParser())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows));
  });
}

function getCol(row, keys, fallback = '') {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k];
  }
  return fallback;
}

async function resolveModelsForRow(row) {
  const modelField = cleanString(getCol(row, ['Model(s)', 'Models', 'Model', 'model', 'models']));
  const apiKey = cleanString(getCol(row, ['APIKey', 'ApiKey', 'api_key', 'apiKey']));
  const providerName = cleanString(getCol(row, ['Name', 'Provider', 'provider_name', 'ProviderName']));
  
  if (!modelField) {
    log('warn', 'No Model(s) field provided');
    return [];
  }

  // Check if it's a HuggingFace URL
  const isHuggingFaceURL = modelField.includes('huggingface.co/api/models');
  
  // Check if it's a delimited list (pipe or comma separated)
  const isDelimitedList = modelField.includes('|') || modelField.includes(',');
  
  // Check if it's a single model name
  const isModelName = cleanString(modelField).length > 0 && !isURL(modelField) && !isDelimitedList;
  
  log('debug', `Processing model field: "${modelField}" (isURL: ${isURL(modelField)}, isDelimitedList: ${isDelimitedList}, isModelName: ${isModelName}, isHuggingFaceURL: ${isHuggingFaceURL})`);
  
  if (!isURL(modelField) && !isDelimitedList && !isModelName) {
    log('error', `Model(s) field must contain a valid URL, delimited list, or model name, got: ${modelField}`);
    return [];
  }

  try {
    let models = [];
    
    // Handle different input types
    if (isDelimitedList) {
      // Process delimited list (pipe or comma separated)
      const delimiter = modelField.includes('|') ? '|' : ',';
      const modelNames = modelField.split(delimiter).map(name => cleanString(name)).filter(name => name);
      
      log('debug', `Processing ${modelNames.length} models from delimited list:`, modelNames);
      
      // Create model entries from names with HuggingFace search
      models = [];
      for (const name of modelNames) {
        try {
          const searchResult = await searchHuggingFaceByModelName(name);
          models.push({
            id: normalizeModelId(name),
            capabilities: searchResult.capabilities,
            meta: {
              type: 'delimited-list',
              original: name,
              ...(searchResult.meta || {})
            }
          });
        } catch (error) {
          log('warn', `Failed to process model ${name} from delimited list:`, error.message);
          // Add fallback model entry
          models.push({
            id: normalizeModelId(name),
            capabilities: inferCapabilitiesFromModelName(name),
            meta: { type: 'delimited-list', original: name, error: error.message }
          });
        }
      }
      
    } else if (isModelName) {
      // Handle single model name
      log('debug', `Processing single model name: ${modelField}`);
      
      // Try to search HuggingFace first, fallback to pattern matching
      const searchResult = await searchHuggingFaceByModelName(modelField);
      
      models = [{
        id: normalizeModelId(modelField),
        capabilities: searchResult.capabilities,
        meta: {
          type: 'single-model',
          original: modelField,
          ...(searchResult.meta || {})
        }
      }];
      
    } else if (isHuggingFaceURL) {
      // Fetch from HuggingFace API
      const authHeader = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
      const data = await httpGet(modelField, authHeader);
      
      models = extractModelsFromResponse(data, true);
      
      // If we have an API key, enhance with detailed capabilities
      if (HF_API_KEY) {
        const hfAPI = new HuggingFaceAPI(HF_API_KEY);
        
        // Enhance models with detailed capabilities
        for (const model of models) {
          try {
            const details = await hfAPI.getModelDetails(model.id);
            if (details) {
              model.capabilities = details.capabilities;
              model.meta = { ...model.meta, ...details.provider_data };
            }
          } catch (error) {
            log('debug', `Could not enhance model ${model.id}:`, error.message);
          }
        }
      }
      
    } else if (isURL(modelField)) {
      // Fetch from other API endpoints
      const authHeader = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
      const data = await httpGet(modelField, authHeader);
      
      models = extractModelsFromResponse(data, false);
    }
    
    if (models.length === 0) {
      log('warn', `No models resolved from: ${modelField}`);
    }
    
    return models;
  } catch (e) {
    log('error', `Failed to process models from ${modelField}:`, e?.message || e);
    return [];
  }
}

function initResults() {
  return { endpoints: {} };
}

function addModel(results, endpoint, model, providerConfig) {
  if (!results.endpoints[endpoint]) results.endpoints[endpoint] = { models: {} };
  if (!results.endpoints[endpoint].models[model]) results.endpoints[endpoint].models[model] = [];
  results.endpoints[endpoint].models[model].push(providerConfig);
}

async function generateProvidersJSON(csvPath, outputPath) {
  log('info', `Reading CSV: ${csvPath}`);
  const rows = await readCSV(csvPath);
  
  // Filter out empty rows (all fields empty or just empty strings)
  const validRows = rows.filter((row, idx) => {
    const hasData = Object.values(row).some(value =>
      value != null && value.toString().trim() !== ''
    );
    
    if (!hasData) {
      log('debug', `Skipping empty row ${idx + 1}`);
      return false;
    }
    
    return true;
  });
  
  log('info', `Found ${validRows.length} valid rows out of ${rows.length} total rows`);
  
  const results = initResults();
  let processedCount = 0;
  let errorCount = 0;

  // Initialize HuggingFace API if key is available
  const hfAPI = HF_API_KEY ? new HuggingFaceAPI(HF_API_KEY) : null;
  if (hfAPI) {
    log('info', 'HuggingFace API integration enabled');
  }

  // Process each row with concurrency
  await Promise.all(validRows.map((row, idx) => limit(async () => {
    try {
      // Extract and validate required fields
      const providerName = cleanString(getCol(row, ['Name', 'Provider', 'provider_name', 'ProviderName'], `Provider_${idx + 1}`));
      const baseURL = cleanString(getCol(row, ['Base_URL', 'BaseURL', 'Base Url', 'base_url']));
      const apiKey = cleanString(getCol(row, ['APIKey', 'ApiKey', 'api_key', 'apiKey']));
      const modelField = cleanString(getCol(row, ['Model(s)', 'Models', 'Model', 'model', 'models']));
      const priority = parseNumber(getCol(row, ['Priority', 'priority']), 99);
      const tokenMultiplier = parseNumber(getCol(row, ['TokenMultiplier', 'token_multiplier']), 1.0);
      const forceEndpoint = cleanString(getCol(row, ['ForceEndpoint', 'Endpoint', 'endpoint', 'type']));
      
      // Extract and parse rate limit/cost information
      const rateLimitCostInfo = cleanString(getCol(row, ['Rate Limit/Cost Info', 'RateLimit', 'CostInfo', 'rate_limit', 'cost_info']));
      const parsedCostInfo = parseRateLimitCostInfo(rateLimitCostInfo);

      // Required field validation
      if (!providerName) {
        log('error', `Row ${idx + 1}: Missing required field "Name"`);
        errorCount++;
        return;
      }

      if (!baseURL) {
        log('error', `Row ${idx + 1}: Provider "${providerName}" - missing required field "Base_URL"`);
        errorCount++;
        return;
      }

      if (!modelField) {
        log('error', `Row ${idx + 1}: Provider "${providerName}" - missing required field "Model(s)"`);
        errorCount++;
        return;
      }

      // URL validation for base URL (must be a URL)
      if (!isURL(baseURL)) {
        log('error', `Row ${idx + 1}: Provider "${providerName}" - invalid Base_URL format: ${baseURL}`);
        errorCount++;
        return;
      }

      // Model field validation - can be URL, delimited list, or single model name
      const isHuggingFaceURL = modelField.includes('huggingface.co/api/models');
      const isDelimitedList = modelField.includes('|') || modelField.includes(',');
      const isModelName = cleanString(modelField).length > 0 && !isURL(modelField) && !isDelimitedList;
      
      if (!isURL(modelField) && !isDelimitedList && !isModelName) {
        log('error', `Row ${idx + 1}: Provider "${providerName}" - invalid Model(s) format: ${modelField} (must be URL, delimited list, or model name)`);
        errorCount++;
        return;
      }

      // Handle empty API keys gracefully
      if (!apiKey) {
        log('warn', `Row ${idx + 1}: Provider "${providerName}" - no API key provided, continuing with public access`);
      }

      const modelEntries = await resolveModelsForRow(row);
      if (modelEntries.length === 0) {
        log('warn', `Row ${idx + 1}: Provider "${providerName}" - no models resolved from ${modelField}`);
        errorCount++;
        return;
      }

      for (const entry of modelEntries) {
        const modelId = entry.id;
        const endpoint = chooseEndpoint({
          forceEndpoint: forceEndpoint ? ENDPOINTS_MAP[forceEndpoint] || forceEndpoint : '',
          modelName: modelId,
          capabilities: entry.capabilities,
          meta: entry.meta || {},
        });

        const providerConfig = {
          provider_name: providerName,
          base_url: baseURL,
          api_key: apiKey || null,
          model: modelId,
          priority: priority,
          token_multiplier: tokenMultiplier,
          capabilities: entry.capabilities || [],
          metadata: {
            ...entry.meta,
            rate_limit_cost_info: parsedCostInfo,
            is_free: parsedCostInfo.is_free,
            daily_limit: parsedCostInfo.daily_limit,
            rate_limit: parsedCostInfo.rate_limit,
            cost_per_token: parsedCostInfo.cost_per_token,
            cost_type: parsedCostInfo.cost_type
          }
        };

        addModel(results, endpoint, modelId, providerConfig);
      }

      processedCount++;
      log('debug', `Row ${idx + 1}: Successfully processed provider "${providerName}" with ${modelEntries.length} model(s)`);

    } catch (error) {
      log('error', `Row ${idx + 1}: Unexpected error processing provider:`, error?.message || error);
      errorCount++;
    }
  })));

  // Summary report
  log('info', `Processing complete: ${processedCount} providers processed, ${errorCount} errors encountered`);

  // Write output
  const json = JSON.stringify(results, null, 2);
  await fs.promises.writeFile(outputPath, json, 'utf8');
  log('info', `Wrote providers.json: ${outputPath}`);
  return results;
}

/* ------------------------------ Watcher (hot reload) ------------------------------ */

function watchCSV(csvPath, onChange) {
  let timer = null;
  let lastMtimeMs = 0;

  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const stat = await fs.promises.stat(csvPath).catch(() => null);
        if (stat && stat.mtimeMs !== lastMtimeMs) {
          lastMtimeMs = stat.mtimeMs;
          log('info', 'Change detected, regenerating providers.json...');
          await onChange();
        }
      } catch (e) {
        log('error', 'Error during hot reload:', e?.message || e);
      }
    }, 350); // debounce
  };

  // Initial stat
  fs.promises.stat(csvPath).then(stat => { lastMtimeMs = stat.mtimeMs; }).catch(() => {});

  fs.watch(path.dirname(csvPath), { persistent: true }, (eventType, filename) => {
    if (!filename) return;
    if (path.resolve(path.dirname(csvPath), filename) === path.resolve(csvPath)) {
      trigger();
    }
  });

  log('info', `Watching for changes: ${csvPath}`);
}

/* ------------------------------ CLI entry ------------------------------ */

async function main() {
  try {
    // Wait for fetch to be available
    let attempts = 0;
    while (!fetch && attempts < 10) {
      await delay(100);
      attempts++;
    }
    
    if (!fetch) {
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    }
    
    await generateProvidersJSON(CSV_PATH, OUTPUT_PATH);
  } catch (e) {
    log('error', 'Failed to generate providers.json:', e?.message || e);
    process.exitCode = 1;
  }

  if (WATCH) {
    watchCSV(CSV_PATH, async () => {
      try {
        await generateProvidersJSON(CSV_PATH, OUTPUT_PATH);
      } catch (e) {
        log('error', 'Hot reload generation failed:', e?.message || e);
      }
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  generateProvidersJSON,
  inferEndpointFromName,
  inferEndpointFromCapabilities,
  chooseEndpoint,
  HuggingFaceAPI
};