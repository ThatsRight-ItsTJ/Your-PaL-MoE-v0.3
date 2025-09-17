#!/usr/bin/env node
/**
 * Dyna‑MoE: CSV → providers.json generator
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
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const csvParser = require('csv-parser');
const { setTimeout: delay } = require('timers/promises');

/* ------------------------------ Config ------------------------------ */

const CSV_PATH = process.env.CSV_PATH || path.resolve(process.cwd(), 'providers.csv');
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.resolve(process.cwd(), 'providers.json');
const WATCH = process.env.WATCH === '1' || process.env.WATCH === 'true';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 12000);
const RETRIES = Number(process.env.RETRIES || 2);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 6));

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

function normalizeModelId(raw) {
  if (!raw) return '';
  let m = cleanString(raw);

  // Drop query/fragment
  m = m.replace(/[?#].*$/, '');

  // Common qualifiers like ":free"
  m = m.replace(/:free$/i, '');

  // If it's a namespaced id like "org/model", take model (keep full if useful)
  // We'll keep full unless it's obviously a URL path
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

/* ------------------------------ Endpoint inference ------------------------------ */

const ENDPOINTS = {
  CHAT: '/v1/chat/completions',
  EMBED: '/v1/embeddings',
  IMAGE: '/v1/images/generations',
  AUDIO_STT: '/v1/audio/transcriptions',
  AUDIO_TTS: '/v1/audio/speech',
  VISION: '/v1/vision/analysis',
};

function inferEndpointFromMeta(meta = {}) {
  const type = cleanString(meta.type).toLowerCase();
  const caps = Array.isArray(meta.capabilities) ? meta.capabilities.map(c => cleanString(c).toLowerCase()) : [];
  const tags = Array.isArray(meta.tags) ? meta.tags.map(t => cleanString(t).toLowerCase()) : [];

  const bag = new Set([type, ...caps, ...tags].filter(Boolean));

  if (bag.has('embedding') || bag.has('embeddings')) return ENDPOINTS.EMBED;
  if (bag.has('image') || bag.has('images') || bag.has('generation') || bag.has('img2img')) return ENDPOINTS.IMAGE;
  if (bag.has('transcription') || bag.has('stt') || bag.has('speech-to-text')) return ENDPOINTS.AUDIO_STT;
  if (bag.has('tts') || bag.has('text-to-speech')) return ENDPOINTS.AUDIO_TTS;
  if (bag.has('vision') || bag.has('multimodal') || bag.has('image-understanding')) return ENDPOINTS.VISION;
  if (bag.has('chat') || bag.has('text') || bag.has('completion') || bag.has('llm')) return ENDPOINTS.CHAT;

  return null;
}

function inferEndpointFromName(modelName = '') {
  const n = cleanString(modelName).toLowerCase();

  // Embeddings
  if (/\b(embed|embedding|vector)\b/.test(n)) return ENDPOINTS.EMBED;

  // Image generation
  if (/\b(image|images|img|dalle|sd|stable|diffusion|flux|sdxl)\b/.test(n)) return ENDPOINTS.IMAGE;

  // Audio STT
  if (/\b(whisper|transcribe|speech2text|speech-to-text|asr)\b/.test(n)) return ENDPOINTS.AUDIO_STT;

  // Audio TTS
  if (/\b(tts|text2speech|text-to-speech|voice)\b/.test(n)) return ENDPOINTS.AUDIO_TTS;

  // Vision / multimodal
  if (/\b(vision|clip|blip|ocr|multimodal|vlm)\b/.test(n)) return ENDPOINTS.VISION;

  // Default to chat
  return ENDPOINTS.CHAT;
}

function chooseEndpoint({ forceEndpoint, modelName, meta }) {
  if (forceEndpoint && ENDPOINTS_MAP[forceEndpoint]) return ENDPOINTS_MAP[forceEndpoint];
  const fromMeta = inferEndpointFromMeta(meta);
  if (fromMeta) return fromMeta;
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
  const maxDelay = 30000; // Maximum 30 seconds between retries
  const baseDelay = 1000; // Start with 1 second
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, { headers, timeout });
      return res.data;
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      const isRetryable = !status ||
                         (status >= 500 && status < 600) ||
                         err.code === 'ECONNABORTED' ||
                         err.code === 'ETIMEDOUT' ||
                         err.code === 'ENOTFOUND' ||
                         err.code === 'ECONNREFUSED';
      
      // Exponential backoff with jitter
      const delayMs = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 1000; // Add up to 1 second of randomness
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
  
  // Provide detailed error message for debugging
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

function extractModelsFromResponse(data) {
  // Support a variety of shapes:
  // - Array of strings: ["gpt-4", "gpt-3.5-turbo"]
  // - Array of objects: [{id, name, model, type, capabilities, tags}, ...]
  // - Object with .models or .data fields containing arrays
  const candidates = [];

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
  const authHeader = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  if (!modelField) {
    log('warn', 'No Model(s) field provided');
    return [];
  }

  // Force URL-based model resolution only
  if (!isURL(modelField)) {
    log('error', `Model(s) field must contain a valid URL, got: ${modelField}`);
    return [];
  }

  try {
    const data = await httpGet(modelField, authHeader);
    const models = extractModelsFromResponse(data);
    if (models.length === 0) {
      log('warn', `Model endpoint returned no models: ${modelField}`);
    }
    return models;
  } catch (e) {
    log('error', `Failed to fetch models from ${modelField}:`, e?.message || e);
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
  const results = initResults();
  let processedCount = 0;
  let errorCount = 0;

  // Process each row with concurrency
  await Promise.all(rows.map((row, idx) => limit(async () => {
    try {
      // Extract and validate required fields
      const providerName = cleanString(getCol(row, ['Name', 'Provider', 'provider_name', 'ProviderName'], `Provider_${idx + 1}`));
      const baseURL = cleanString(getCol(row, ['Base_URL', 'BaseURL', 'Base Url', 'base_url']));
      const apiKey = cleanString(getCol(row, ['APIKey', 'ApiKey', 'api_key', 'apiKey']));
      const modelField = cleanString(getCol(row, ['Model(s)', 'Models', 'Model', 'model', 'models']));
      const other = cleanString(getCol(row, ['Other', 'other', 'metadata', 'info']));
      const forceEndpoint = cleanString(getCol(row, ['ForceEndpoint', 'Endpoint', 'endpoint', 'type']));

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

      // URL validation
      if (!isURL(baseURL)) {
        log('error', `Row ${idx + 1}: Provider "${providerName}" - invalid Base_URL format: ${baseURL}`);
        errorCount++;
        return;
      }

      if (!isURL(modelField)) {
        log('error', `Row ${idx + 1}: Provider "${providerName}" - invalid Model(s) URL format: ${modelField}`);
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
          meta: entry.meta || {},
        });

        const providerConfig = {
          provider_name: providerName,
          base_url: baseURL,
          api_key: apiKey || null, // Explicitly set to null if empty
          model: modelId,
          other: other || null, // Preserve "Other" column data as metadata
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
  inferEndpointFromMeta,
  chooseEndpoint,
};