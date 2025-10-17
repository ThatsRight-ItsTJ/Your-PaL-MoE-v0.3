#!/usr/bin/env node
/**
 * Provider Health Check Script
 * Tests each provider in providers.csv by making a single API request
 * Reports health status, response times, and any errors
 */

const fs = require('fs').promises;
const path = require('path');
const csvParser = require('csv-parser');

// Import utilities from the CSV generator
const {
  sanitizeInput,
  validateURL,
  detectResponseFormatDynamic,
  sanitizeError
} = require('./csv-to-providers-secure-final');

/* ------------------------------ Configuration ------------------------------ */

const CSV_PATH = process.env.CSV_PATH || path.resolve(process.cwd(), 'providers.csv');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 10000); // 10 second timeout
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 3)); // Limit concurrent requests

/* ------------------------------ Logger ------------------------------ */

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
function log(level, ...args) {
  if (levels[level] <= (levels[LOG_LEVEL] ?? 2)) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}

/* ------------------------------ HTTP Request Utilities ------------------------------ */

// Use node-fetch for HTTP requests
let fetch;
(async () => {
  const nodeFetch = await import('node-fetch');
  fetch = nodeFetch.default;
})();

/**
 * Fetch available models from a provider's model list endpoint
 */
async function fetchProviderModels(modelEndpointURL, apiKey) {
  try {
    const headers = {
      'User-Agent': 'Your-PaL-MoE-HealthCheck/1.0'
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    log('debug', `Fetching models from: ${modelEndpointURL}`);

    const response = await fetch(modelEndpointURL, {
      headers: headers,
      timeout: TIMEOUT_MS
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Extract model names from various response formats
    let models = [];

    if (Array.isArray(data)) {
      // Handle simple arrays like ["flux","kontext","turbo","gptimage"]
      if (data.length > 0 && typeof data[0] === 'string') {
        models = data.filter(item => typeof item === 'string' && item.trim());
      } else {
        // Handle arrays of objects - try multiple possible name fields
        models = data.map(item => item.id || item.name || item.model || item.slug).filter(Boolean);
      }
    } else if (data.models && Array.isArray(data.models)) {
      models = data.models.map(item => item.id || item.name || item.model).filter(Boolean);
    } else if (data.data && Array.isArray(data.data)) {
      models = data.data.map(item => item.id || item.name || item.model || item.slug).filter(Boolean);
    } else if (data.object === 'list' && data.data && Array.isArray(data.data)) {
      // Handle OpenAI-style responses
      models = data.data.map(item => item.id || item.name || item.model).filter(Boolean);
    }

    log('debug', `Found ${models.length} models: ${models.slice(0, 3).join(', ')}${models.length > 3 ? '...' : ''}`);
    return models;

  } catch (error) {
    log('debug', `Failed to fetch models from ${modelEndpointURL}:`, sanitizeError(error));
    return [];
  }
}

/**
 * Get a test model name for a provider
 */
async function getTestModelForProvider(providerName, modelEndpointURL, apiKey, modelField) {
  // First, try to parse models from the modelField if it contains pipe/comma separated values
  if (modelField && (modelField.includes('|') || modelField.includes(','))) {
    const delimiter = modelField.includes('|') ? '|' : ',';
    const models = modelField.split(delimiter).map(m => m.trim()).filter(m => m);
    if (models.length > 0) {
      log('debug', `Using model from CSV field: ${models[0]}`);
      return models[0];
    }
  }

  // If we have a model endpoint URL, try to fetch models
  if (modelEndpointURL && modelEndpointURL.startsWith('http')) {
    const models = await fetchProviderModels(modelEndpointURL, apiKey);
    if (models.length > 0) {
      return models[0]; // Use first available model
    }
  }

  // Fallback to provider-specific defaults
  const defaults = {
    'openrouter': 'microsoft/wizardlm-2-8x22b',
    'z.ai': 'GLM-4.5-Flash',
    'bigmodel.cn': 'glm-4-flash',
    'electronhub': 'gpt-4o-mini',
    'navy': 'gpt-4o-mini',
    'mnnai': 'gpt-4o-mini',
    'helixmind': 'gpt-4o',
    'zukijourney': 'gpt-4o-mini',
    'voidai': 'gpt-4o-mini',
    'pollinations': 'openai/gpt-4o-mini',
    'imagerouter': 'google/gemini-2.5-flash:free'
  };

  const providerKey = providerName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const defaultModel = defaults[providerKey] || 'gpt-4o-mini';

  log('debug', `Using default model for ${providerName}: ${defaultModel}`);
  return defaultModel;
}

/**
 * Make a test HTTP request to a provider endpoint
 */
async function testProviderEndpoint(baseURL, apiKey, responseFormat, testModel, endpoint = '/v1/chat/completions') {
  const startTime = Date.now();

  try {
    // Construct test URL
    const testURL = new URL(endpoint, baseURL).href;

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Your-PaL-MoE-HealthCheck/1.0'
    };

    // Add authorization if API key is provided
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Prepare test payload based on endpoint
    let testPayload;
    if (endpoint.includes('/chat/completions')) {
      testPayload = JSON.stringify({
        model: testModel,
        messages: [{ role: 'user', content: 'Hello, this is a health check test.' }],
        max_tokens: 10
      });
    } else if (endpoint.includes('/images/generations')) {
      testPayload = JSON.stringify({
        model: testModel,
        prompt: 'A simple test image',
        size: '256x256'
      });
    } else if (endpoint.includes('/embeddings')) {
      testPayload = JSON.stringify({
        model: testModel,
        input: 'This is a test input for embeddings'
      });
    } else if (baseURL.includes('text.pollinations.ai')) {
      // Special case for Pollinations text - model and messages needed
      testPayload = JSON.stringify({
        model: testModel,
        messages: [{ role: 'user', content: 'Hello, this is a health check test.' }]
      });
    } else if (baseURL.includes('image.pollinations.ai') && endpoint.includes('/prompt')) {
      // Special case for Pollinations image - simple prompt parameter
      testPayload = 'A simple test image for health check';
      headers['Content-Type'] = 'text/plain'; // Override to plain text for prompt
    } else {
      // Generic test payload
      testPayload = JSON.stringify({ test: true });
    }

    headers['Content-Length'] = Buffer.byteLength(testPayload);

    log('debug', `Testing ${testURL} with model ${testModel} (${responseFormat} format)`);

    const response = await fetch(testURL, {
      method: 'POST',
      headers: headers,
      body: testPayload,
      timeout: TIMEOUT_MS
    });

    const responseTime = Date.now() - startTime;

    // Check response based on expected format
    let isHealthy = false;
    let responseDetails = {};

    if (responseFormat === 'html') {
      // For HTML responses, check if we get a valid response (not necessarily 200)
      const responseText = await response.text();
      isHealthy = responseText.length > 0;
      responseDetails = {
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentLength: responseText.length
      };
    } else {
      // For JSON responses, check status and try to parse
      if (response.ok) {
        // Special handling for image providers - if they return images, consider healthy
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.startsWith('image/')) {
          isHealthy = true;
          responseDetails = {
            status: response.status,
            contentType: contentType,
            isImage: true
          };
        } else if (contentType && contentType.includes('text/plain')) {
          // Special handling for text responses (like Pollinations text)
          try {
            const textResponse = await response.text();
            isHealthy = textResponse && textResponse.length > 0;
            responseDetails = {
              status: response.status,
              contentType: contentType,
              hasText: !!textResponse,
              textLength: textResponse.length
            };
          } catch (textError) {
            isHealthy = false;
            responseDetails = {
              status: response.status,
              contentType: contentType,
              textError: textError.message
            };
          }
        } else {
          try {
            const responseData = await response.json();
            isHealthy = true;
            responseDetails = {
              status: response.status,
              contentType: response.headers.get('content-type'),
              hasData: !!responseData
            };
          } catch (parseError) {
            // Response is not valid JSON
            isHealthy = false;
            responseDetails = {
              status: response.status,
              contentType: response.headers.get('content-type'),
              parseError: parseError.message
            };
          }
        }
      } else {
        // HTTP error status
        const errorText = await response.text().catch(() => 'No error details');
        isHealthy = false;
        responseDetails = {
          status: response.status,
          statusText: response.statusText,
          error: errorText.substring(0, 200) // Limit error text length
        };
      }
    }

    return {
      healthy: isHealthy,
      responseTime: responseTime,
      details: responseDetails,
      error: null,
      testModel: testModel
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      healthy: false,
      responseTime: responseTime,
      details: null,
      error: sanitizeError(error),
      testModel: testModel
    };
  }
}

/* ------------------------------ CSV Reading ------------------------------ */

async function readCSV(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim());

    // Parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index].trim();
        });
        rows.push(row);
      }
    }

    return rows;
  } catch (error) {
    throw new Error(`Failed to read CSV file: ${error.message}`);
  }
}

function getCol(row, keys, fallback = '') {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k];
  }
  return fallback;
}

/* ------------------------------ Concurrency Control ------------------------------ */

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

/* ------------------------------ Main Health Check Function ------------------------------ */

async function performHealthCheck() {
  log('info', `Starting provider health check for: ${CSV_PATH}`);

  // Read CSV file
  const rows = await readCSV(CSV_PATH);
  log('info', `Found ${rows.length} providers in CSV`);

  const results = {
    timestamp: new Date().toISOString(),
    total: rows.length,
    healthy: 0,
    unhealthy: 0,
    results: []
  };

  // Process each provider with concurrency control
  const checkPromises = rows.map((row, index) => limit(async () => {
    const providerName = sanitizeInput(getCol(row, ['Name', 'Provider', 'provider_name']), 'name');
    const baseURL = sanitizeInput(getCol(row, ['Base_URL', 'BaseURL', 'Base Url', 'base_url']), 'url');
    const apiKey = sanitizeInput(getCol(row, ['APIKey', 'ApiKey', 'api_key', 'apiKey']), 'key');
    const modelEndpointURL = getCol(row, ['Model(s) list endpoint', 'Models endpoint', 'models_endpoint']);
    const modelField = getCol(row, ['Model(s)', 'Models', 'Model', 'model', 'models']);

    log('info', `Testing provider ${index + 1}/${rows.length}: ${providerName}`);

    const providerResult = {
      index: index + 1,
      name: providerName,
      baseURL: baseURL,
      hasApiKey: !!apiKey,
      modelEndpointURL: modelEndpointURL,
      modelField: modelField,
      healthy: false,
      responseTime: null,
      error: null,
      details: null,
      testModel: null
    };

    try {
      // Validate required fields
      if (!providerName) {
        throw new Error('Missing provider name');
      }

      if (!baseURL) {
        throw new Error('Missing base URL');
      }

      if (!validateURL(baseURL)) {
        throw new Error(`Invalid base URL format: ${baseURL}`);
      }

      // Special handling for NoAuth Pollinations text - use different endpoint
      if (providerName === 'NoAuth_Pollinations_Text' && baseURL.includes('text.pollinations.ai')) {
        // Get a real model name to test with
        let testModel = await getTestModelForProvider(providerName, modelEndpointURL, apiKey, modelField);
        providerResult.testModel = testModel;

        // Skip format detection and test directly
        const testEndpoint = '/'; // Use root endpoint for text pollinations
        const responseFormat = 'json'; // Force JSON format for text pollinations

        try {
          const testResult = await testProviderEndpoint(baseURL, apiKey, responseFormat, testModel, testEndpoint);
          providerResult.healthy = testResult.healthy;
          providerResult.responseTime = testResult.responseTime;
          providerResult.details = testResult.details;
          providerResult.error = testResult.error;
          providerResult.testModel = testResult.testModel;

          if (testResult.healthy) {
            log('info', `✅ ${providerName}: HEALTHY (${testResult.responseTime}ms) - tested with ${testModel}`);
            results.healthy++;
          } else {
            log('warn', `❌ ${providerName}: UNHEALTHY (${testResult.responseTime}ms) - tested with ${testModel} - ${testResult.error || 'Unknown error'}`);
            results.unhealthy++;
          }
        } catch (error) {
          providerResult.error = sanitizeError(error);
          log('error', `❌ ${providerName}: ERROR - ${providerResult.error}`);
          results.unhealthy++;
        }

        results.results.push(providerResult);
        return providerResult;
      }

      // Get a real model name to test with
      let testModel = await getTestModelForProvider(providerName, modelEndpointURL, apiKey, modelField);
      providerResult.testModel = testModel;

      // Detect response format
      const responseFormat = await detectResponseFormatDynamic(providerName, baseURL, apiKey);

      // Determine test endpoint based on provider type
      let testEndpoint = '/v1/chat/completions'; // Default

      if (providerName.toLowerCase().includes('image') || baseURL.includes('image.pollinations.ai')) {
        testEndpoint = '/prompt/test'; // Image generation endpoint
      } else if (providerName.toLowerCase().includes('embedding')) {
        testEndpoint = '/v1/embeddings';
      }

      // Perform the health check
      const testResult = await testProviderEndpoint(baseURL, apiKey, responseFormat, testModel, testEndpoint);

      providerResult.healthy = testResult.healthy;
      providerResult.responseTime = testResult.responseTime;
      providerResult.details = testResult.details;
      providerResult.error = testResult.error;
      providerResult.testModel = testResult.testModel;

      if (testResult.healthy) {
        log('info', `✅ ${providerName}: HEALTHY (${testResult.responseTime}ms) - tested with ${testModel}`);
        results.healthy++;
      } else {
        log('warn', `❌ ${providerName}: UNHEALTHY (${testResult.responseTime}ms) - tested with ${testModel} - ${testResult.error || 'Unknown error'}`);
        results.unhealthy++;
      }

    } catch (error) {
      providerResult.error = sanitizeError(error);
      log('error', `❌ ${providerName}: ERROR - ${providerResult.error}`);
      results.unhealthy++;
    }

    results.results.push(providerResult);
    return providerResult;
  }));

  // Wait for all checks to complete
  await Promise.all(checkPromises);

  // Sort results by health status and response time
  results.results.sort((a, b) => {
    if (a.healthy !== b.healthy) return a.healthy ? -1 : 1;
    return (a.responseTime || 999999) - (b.responseTime || 999999);
  });

  // Generate summary report
  log('info', '='.repeat(60));
  log('info', 'HEALTH CHECK SUMMARY');
  log('info', '='.repeat(60));
  log('info', `Total providers tested: ${results.total}`);
  log('info', `Healthy: ${results.healthy}`);
  log('info', `Unhealthy: ${results.unhealthy}`);
  log('info', `Success rate: ${((results.healthy / results.total) * 100).toFixed(1)}%`);
  log('info', '');

  // Show detailed results
  log('info', 'DETAILED RESULTS:');
  log('info', '-'.repeat(60));

  results.results.forEach(result => {
    const status = result.healthy ? '✅' : '❌';
    const time = result.responseTime ? `${result.responseTime}ms` : 'N/A';
    const error = result.error ? ` - ${result.error}` : '';
    log('info', `${status} ${result.name}: ${time}${error}`);
  });

  // Save results to file
  const outputPath = path.resolve(process.cwd(), 'health-check-results.json');
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2), 'utf8');
  log('info', `Results saved to: ${outputPath}`);

  return results;
}

/* ------------------------------ Main Entry Point ------------------------------ */

async function main() {
  try {
    // Wait for fetch to be available
    let attempts = 0;
    while (!fetch && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!fetch) {
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    }

    await performHealthCheck();
    log('info', 'Health check completed successfully');

  } catch (error) {
    log('error', 'Health check failed:', sanitizeError(error));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  performHealthCheck,
  testProviderEndpoint
};