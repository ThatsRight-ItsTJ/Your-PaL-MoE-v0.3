#!/usr/bin/env node

/**
 * Script to extract API keys from providers.csv and set them as environment variables
 * Creates a secure mapping between provider names and environment variables
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');

// Configuration
const CSV_PATH = process.env.CSV_PATH || path.resolve(process.cwd(), 'providers.csv');
const ENV_FILE_PATH = path.resolve(process.cwd(), '.env');
const KEY_MAPPING_FILE = path.resolve(process.cwd(), 'key-mapping.json');

// Environment variable prefix for API keys
const ENV_PREFIX = 'API_KEY_';

// Results tracking
const results = {
  totalProviders: 0,
  providersWithKeys: 0,
  providersWithoutKeys: 0,
  extractedKeys: {},
  errors: []
};

/**
 * Log function with timestamp
 */
function log(level, ...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}]`, ...args);
}

/**
 * Sanitize environment variable name
 */
function sanitizeEnvVarName(name) {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_') // Replace non-alphanumeric characters with underscores
    .toUpperCase() // Convert to uppercase
    .replace(/^_+/, '') // Remove leading underscores
    .replace(/_+$/, ''); // Remove trailing underscores
}

/**
 * Read CSV file and extract provider data
 */
async function readProvidersCSV() {
  return new Promise((resolve, reject) => {
    const providers = [];
    
    fs.createReadStream(CSV_PATH)
      .on('error', (error) => {
        log('error', 'Failed to read CSV file:', error.message);
        reject(error);
      })
      .pipe(csvParser())
      .on('data', (row) => {
        providers.push(row);
      })
      .on('end', () => {
        log('info', `Read ${providers.length} rows from CSV`);
        resolve(providers);
      });
  });
}

/**
 * Process providers and extract API keys
 */
function processProviders(providers) {
  const keyMapping = {};
  const envVars = {};
  
  providers.forEach((provider, index) => {
    try {
      const providerName = provider.Name || provider.name || `Provider_${index + 1}`;
      const apiKey = provider.APIKey || provider.api_key || '';
      
      results.totalProviders++;
      
      if (apiKey && apiKey.trim() !== '') {
        // Create environment variable name
        const envVarName = `${ENV_PREFIX}${sanitizeEnvVarName(providerName)}`;
        
        // Store the mapping
        keyMapping[providerName] = {
          envVar: envVarName,
          originalKey: apiKey,
          maskedKey: maskApiKey(apiKey)
        };
        
        // Store for environment file
        envVars[envVarName] = apiKey;
        
        results.extractedKeys[providerName] = envVarName;
        results.providersWithKeys++;
        
        log('debug', `Extracted API key for ${providerName} -> ${envVarName}`);
      } else {
        results.providersWithoutKeys++;
        log('warn', `No API key found for provider: ${providerName}`);
      }
    } catch (error) {
      const errorMsg = `Error processing provider ${index + 1}: ${error.message}`;
      log('error', errorMsg);
      results.errors.push(errorMsg);
    }
  });
  
  return { keyMapping, envVars };
}

/**
 * Mask API key for logging
 */
function maskApiKey(key) {
  if (!key || key.length <= 8) return '***';
  return key.substring(0, 4) + '***' + key.substring(key.length - 4);
}

/**
 * Write environment variables to .env file
 */
function writeEnvFile(envVars) {
  try {
    // Create .env content
    let envContent = '# Auto-generated API keys from providers.csv\n';
    envContent += '# Generated on: ' + new Date().toISOString() + '\n\n';
    
    // Add system API keys first
    envContent += '# System API Keys\n';
    envContent += '# ----------------\n';
    Object.entries(SYSTEM_API_KEYS).forEach(([varName, config]) => {
      envContent += `${varName}=${config.example}\n`;
    });
    
    envContent += '\n# Provider API Keys\n';
    envContent += '# -----------------\n';
    
    // Add each environment variable
    Object.entries(envVars).forEach(([varName, value]) => {
      envContent += `${varName}=${value}\n`;
    });
    
    // Add security note
    envContent += '\n# Security Notes\n';
    envContent += '# --------------\n';
    envContent += '# 1. Delete providers.csv after setting these environment variables\n';
    envContent += '# 2. This file contains sensitive API keys and should be protected\n';
    envContent += '# 3. Set proper file permissions: chmod 600 .env\n';
    envContent += '# 4. Update the system API keys above with your actual values\n';
    
    // Write to file
    fs.writeFileSync(ENV_FILE_PATH, envContent, 'utf8');
    log('info', `Environment variables written to: ${ENV_FILE_PATH}`);
    
    return true;
  } catch (error) {
    log('error', 'Failed to write environment file:', error.message);
    return false;
  }
}

/**
 * Write key mapping to JSON file
 */
function writeKeyMapping(keyMapping) {
  try {
    const mappingContent = {
      generatedAt: new Date().toISOString(),
      providers: keyMapping,
      notes: [
        'This file maps provider names to their corresponding environment variables',
        'Use this file as reference when working with providers',
        'This file does not contain actual API keys, only the mapping'
      ]
    };
    
    fs.writeFileSync(KEY_MAPPING_FILE, JSON.stringify(mappingContent, null, 2), 'utf8');
    log('info', `Key mapping written to: ${KEY_MAPPING_FILE}`);
    
    return true;
  } catch (error) {
    log('error', 'Failed to write key mapping file:', error.message);
    return false;
  }
}

/**
 * Generate environment export script
 */
function generateExportScript(keyMapping) {
  try {
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'load-api-keys.sh');
    
    let scriptContent = '#!/bin/bash\n\n';
    scriptContent += '# Auto-generated script to load API keys from .env file\n';
    scriptContent += '# Generated on: ' + new Date().toISOString() + '\n\n';
    scriptContent += '# Load environment variables\n';
    scriptContent += 'if [ -f ".env" ]; then\n';
    scriptContent += '  export $(grep -v "^#" .env | xargs)\n';
    scriptContent += '  echo "Loaded environment variables from .env"\n';
    scriptContent += 'else\n';
    scriptContent += '  echo "Error: .env file not found"\n';
    scriptContent += '  exit 1\n';
    scriptContent += 'fi\n\n';
    
    scriptContent += '# Display loaded keys (masked for security)\n';
    scriptContent += 'echo "Loaded API keys:"\n';
    Object.entries(keyMapping).forEach(([provider, mapping]) => {
      scriptContent += `echo "  ${provider}: ${mapping.maskedKey}"\n`;
    });
    
    // Make script executable
    fs.writeFileSync(scriptPath, scriptContent, 'utf8');
    fs.chmodSync(scriptPath, '755'); // rwxr-xr-x
    
    log('info', `Export script generated: ${scriptPath}`);
    return true;
  } catch (error) {
    log('error', 'Failed to generate export script:', error.message);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  log('info', 'Starting API key extraction from providers.csv');
  
  try {
    // Check if CSV file exists
    if (!fs.existsSync(CSV_PATH)) {
      log('error', `CSV file not found: ${CSV_PATH}`);
      process.exit(1);
    }
    
    // Read providers from CSV
    const providers = await readProvidersCSV();
    
    if (providers.length === 0) {
      log('error', 'No providers found in CSV file');
      process.exit(1);
    }
    
    // Process providers and extract keys
    const { keyMapping, envVars } = processProviders(providers);
    
    // Write results to files
    const envSuccess = writeEnvFile(envVars);
    const mappingSuccess = writeKeyMapping(keyMapping);
    const scriptSuccess = generateExportScript(keyMapping);
    
    // Summary report
    log('info', '\n=== EXTRACTION SUMMARY ===');
    log('info', `Total providers processed: ${results.totalProviders}`);
    log('info', `Providers with API keys: ${results.providersWithKeys}`);
    log('info', `Providers without API keys: ${results.providersWithoutKeys}`);
    log('info', `Environment variables created: ${Object.keys(envVars).length}`);
    log('info', `Errors encountered: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      log('warn', 'Errors encountered:');
      results.errors.forEach(error => log('warn', `  - ${error}`));
    }
    
    // Check if all operations were successful
    if (envSuccess && mappingSuccess && scriptSuccess) {
      log('info', '\n✅ API key extraction completed successfully');
      log('info', 'Next steps:');
      log('info', '1. Review the generated .env file');
      log('info', '2. Update your scripts to use environment variables instead of reading from CSV');
      log('info', '3. Delete providers.csv for security (after verifying everything works)');
      log('info', '4. Use the key-mapping.json file as reference for provider names');
      log('info', '5. Run the load-api-keys.sh script to load environment variables');
    } else {
      log('error', '\n❌ Some operations failed. Please check the error messages above.');
      process.exit(1);
    }
    
  } catch (error) {
    log('error', 'Fatal error:', error.message);
    process.exit(1);
  }
}

// System API keys that should always be included
const SYSTEM_API_KEYS = {
  HF_API_KEY: {
    description: 'HuggingFace API Key (required for model search)',
    required: true,
    example: 'hf_your_huggingface_api_key_here'
  }
};

// Run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  readProvidersCSV,
  processProviders,
  writeEnvFile,
  writeKeyMapping,
  generateExportScript,
  sanitizeEnvVarName,
  maskApiKey,
  SYSTEM_API_KEYS
};