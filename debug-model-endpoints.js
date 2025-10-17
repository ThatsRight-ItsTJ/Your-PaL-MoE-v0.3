#!/usr/bin/env node
/**
 * Debug script to test model endpoints from providers.csv
 * Shows actual responses from model list endpoints to diagnose parsing issues
 */

const fs = require('fs').promises;
const path = require('path');

// Use node-fetch for HTTP requests
let fetch;
(async () => {
  const nodeFetch = await import('node-fetch');
  fetch = nodeFetch.default;
})();

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

/* ------------------------------ Model Endpoint Testing ------------------------------ */

async function testModelEndpoint(providerName, modelEndpointURL, apiKey, baseURL) {
  console.log(`\n🔍 Testing ${providerName}:`);
  console.log(`   Endpoint: ${modelEndpointURL}`);
  console.log(`   Base URL: ${baseURL}`);
  console.log(`   Has API Key: ${!!apiKey}`);

  if (!modelEndpointURL || !modelEndpointURL.startsWith('http')) {
    console.log(`   ❌ Invalid or missing endpoint URL`);
    return;
  }

  try {
    const headers = {
      'User-Agent': 'Your-PaL-MoE-Debug/1.0'
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    console.log(`   📡 Making GET request...`);
    const startTime = Date.now();

    const response = await fetch(modelEndpointURL, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });

    const responseTime = Date.now() - startTime;

    console.log(`   📊 Response: ${response.status} ${response.statusText} (${responseTime}ms)`);
    console.log(`   📋 Content-Type: ${response.headers.get('content-type')}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      console.log(`   ❌ HTTP Error: ${errorText.substring(0, 200)}`);
      return;
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        const data = await response.json();
        console.log(`   ✅ JSON Response received`);
        console.log(`   📄 Response structure:`);

        // Show top-level keys
        if (typeof data === 'object' && data !== null) {
          console.log(`      Keys: ${Object.keys(data).join(', ')}`);

          // Check for common model array patterns
          if (Array.isArray(data)) {
            console.log(`      Is array with ${data.length} items`);
            if (data.length > 0) {
              console.log(`      First item keys: ${Object.keys(data[0]).join(', ')}`);
              console.log(`      Sample model IDs: ${data.slice(0, 3).map(item => item.id || item.name || item.model || 'unknown').join(', ')}`);
            }
          } else if (data.models && Array.isArray(data.models)) {
            console.log(`      Found data.models array with ${data.models.length} items`);
            if (data.models.length > 0) {
              console.log(`      First model keys: ${Object.keys(data.models[0]).join(', ')}`);
              console.log(`      Sample model IDs: ${data.models.slice(0, 3).map(item => item.id || item.name || item.model || 'unknown').join(', ')}`);
            }
          } else if (data.data && Array.isArray(data.data)) {
            console.log(`      Found data.data array with ${data.data.length} items`);
            if (data.data.length > 0) {
              console.log(`      First item keys: ${Object.keys(data.data[0]).join(', ')}`);
              console.log(`      Sample model IDs: ${data.data.slice(0, 3).map(item => item.id || item.name || item.model || 'unknown').join(', ')}`);
            }
          } else {
            console.log(`      Not a recognized model list format`);
          }
        } else {
          console.log(`      Not an object`);
        }

        // Show raw response for debugging (truncated)
        const rawJson = JSON.stringify(data);
        console.log(`   📄 Raw response (first 500 chars): ${rawJson.substring(0, 500)}${rawJson.length > 500 ? '...' : ''}`);

      } catch (parseError) {
        console.log(`   ❌ JSON Parse Error: ${parseError.message}`);
        const textResponse = await response.text();
        console.log(`   📄 Raw text response (first 500 chars): ${textResponse.substring(0, 500)}`);
      }
    } else {
      console.log(`   ⚠️  Non-JSON response: ${contentType}`);
      const textResponse = await response.text();
      console.log(`   📄 Response content (first 500 chars): ${textResponse.substring(0, 500)}`);
    }

  } catch (error) {
    console.log(`   ❌ Request failed: ${error.message}`);
  }
}

/* ------------------------------ Main Function ------------------------------ */

async function main() {
  try {
    console.log('🚀 Starting model endpoint debugging...\n');

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

    const csvPath = path.resolve(process.cwd(), 'providers.csv');
    console.log(`📂 Reading providers from: ${csvPath}\n`);

    const rows = await readCSV(csvPath);
    console.log(`📊 Found ${rows.length} providers\n`);

    // Test each provider's model endpoint
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const providerName = getCol(row, ['Name', 'Provider', 'provider_name']);
      const baseURL = getCol(row, ['Base_URL', 'BaseURL', 'Base Url', 'base_url']);
      const apiKey = getCol(row, ['APIKey', 'ApiKey', 'api_key', 'apiKey']);
      const modelEndpointURL = getCol(row, ['Model(s) list endpoint', 'Models endpoint', 'models_endpoint']);

      await testModelEndpoint(providerName, modelEndpointURL, apiKey, baseURL);
    }

    console.log('\n✅ Model endpoint debugging completed!');

  } catch (error) {
    console.error('❌ Debug script failed:', error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}