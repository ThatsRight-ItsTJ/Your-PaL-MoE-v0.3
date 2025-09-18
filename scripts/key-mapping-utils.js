/**
 * Key mapping utilities for environment variable-based API key management
 */

const fs = require('fs');
const path = require('path');

// Configuration
const KEY_MAPPING_FILE = path.resolve(process.cwd(), 'key-mapping.json');

/**
 * Load key mapping from file
 */
function loadKeyMapping() {
  try {
    if (!fs.existsSync(KEY_MAPPING_FILE)) {
      return null;
    }
    
    const mappingData = fs.readFileSync(KEY_MAPPING_FILE, 'utf8');
    return JSON.parse(mappingData);
  } catch (error) {
    console.error('Error loading key mapping:', error.message);
    return null;
  }
}

/**
 * Get API key for a provider from environment variables
 */
function getApiKeyForProvider(providerName) {
  const keyMapping = loadKeyMapping();
  
  if (!keyMapping || !keyMapping.providers || !keyMapping.providers[providerName]) {
    return null;
  }
  
  const envVarName = keyMapping.providers[providerName].envVar;
  return process.env[envVarName] || null;
}

/**
 * Check if all required environment variables are set
 */
function validateEnvironmentVariables() {
  const keyMapping = loadKeyMapping();
  
  if (!keyMapping || !keyMapping.providers) {
    return {
      isValid: false,
      missing: [],
      total: 0
    };
  }
  
  const missing = [];
  Object.entries(keyMapping.providers).forEach(([providerName, mapping]) => {
    if (!process.env[mapping.envVar] || process.env[mapping.envVar].trim() === '') {
      missing.push({
        provider: providerName,
        envVar: mapping.envVar,
        maskedKey: mapping.maskedKey
      });
    }
  });
  
  return {
    isValid: missing.length === 0,
    missing,
    total: Object.keys(keyMapping.providers).length
  };
}

/**
 * Get all loaded environment variables (masked for security)
 */
function getLoadedEnvironmentVariables() {
  const keyMapping = loadKeyMapping();
  
  if (!keyMapping || !keyMapping.providers) {
    return [];
  }
  
  const loaded = [];
  Object.entries(keyMapping.providers).forEach(([providerName, mapping]) => {
    const isLoaded = process.env[mapping.envVar] && process.env[mapping.envVar].trim() !== '';
    loaded.push({
      provider: providerName,
      envVar: mapping.envVar,
      isLoaded,
      maskedKey: mapping.maskedKey
    });
  });
  
  return loaded;
}

/**
 * Generate environment variable documentation
 */
function generateEnvironmentDocumentation() {
  const keyMapping = loadKeyMapping();
  
  if (!keyMapping || !keyMapping.providers) {
    return '# No provider key mapping found';
  }
  
  let doc = '# Environment Variables Documentation\n\n';
  doc += `Generated on: ${new Date().toISOString()}\n\n`;
  doc += '## Required Environment Variables\n\n';
  
  Object.entries(keyMapping.providers).forEach(([providerName, mapping]) => {
    doc += `### ${providerName}\n`;
    doc += `- **Environment Variable**: \`${mapping.envVar}\`\n`;
    doc += `- **Status**: ${process.env[mapping.envVar] ? '✅ Loaded' : '❌ Missing'}\n`;
    doc += `- **Example Value**: ${mapping.maskedKey}\n\n`;
  });
  
  doc += '## Usage\n\n';
  doc += '1. Set these environment variables in your `.env` file\n';
  doc += '2. Or export them in your shell session\n';
  doc += '3. Run your application with the environment variables loaded\n\n';
  doc += '## Security Notes\n\n';
  doc += '- Never commit `.env` files to version control\n';
  doc += '- Use `.env.example` to document required variables\n';
  doc += '- Delete `providers.csv` after setting environment variables\n';
  
  return doc;
}

module.exports = {
  loadKeyMapping,
  getApiKeyForProvider,
  validateEnvironmentVariables,
  getLoadedEnvironmentVariables,
  generateEnvironmentDocumentation
};