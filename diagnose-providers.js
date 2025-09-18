const fs = require('fs').promises;
const path = require('path');

// Load the validation utilities
const { validators } = require('./utils/security');

// Load providers.json
async function loadProviders() {
    try {
        const data = await fs.readFile('providers.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading providers.json:', error.message);
        return null;
    }
}

// Test individual provider validation
function testProviderValidation(provider, index) {
    console.log(`\n=== Testing Provider ${index + 1} ===`);
    console.log('Provider name:', provider?.provider_name || 'Unknown');
    console.log('Base URL:', provider?.base_url || 'Missing');
    console.log('Model:', provider?.model || 'Missing');
    console.log('API Key:', provider?.api_key ? 'Present' : 'Missing');
    
    // Test current validation
    const isValid = validators.validateProvider(provider);
    console.log('✓ Current validation result:', isValid ? 'PASS' : 'FAIL');
    
    if (!isValid) {
        console.log('❌ Validation failed - checking required fields:');
        const required = ['name', 'baseURL', 'models'];
        
        required.forEach(field => {
            const hasField = provider && provider[field];
            console.log(`  - ${field}: ${hasField ? 'Present' : 'Missing'}`);
        });
        
        // Check what fields actually exist
        console.log('🔍 Actual fields in provider:');
        if (provider) {
            Object.keys(provider).forEach(key => {
                console.log(`  - ${key}: ${typeof provider[key]}`);
            });
        }
    }
    
    return isValid;
}

// Main diagnostic function
async function runDiagnostics() {
    console.log('🔍 Starting Provider Diagnostics...\n');
    
    const providersData = await loadProviders();
    if (!providersData || !providersData.endpoints) {
        console.error('❌ Could not load providers configuration');
        return;
    }
    
    let totalProviders = 0;
    let validProviders = 0;
    
    // Iterate through all endpoints and models
    for (const [endpointPath, endpointConfig] of Object.entries(providersData.endpoints)) {
        console.log(`\n📍 Endpoint: ${endpointPath}`);
        
        if (!endpointConfig.models) {
            console.log('❌ No models configured for this endpoint');
            continue;
        }
        
        for (const [modelName, providers] of Object.entries(endpointConfig.models)) {
            console.log(`\n📦 Model: ${modelName}`);
            console.log(`📋 Number of provider options: ${providers.length}`);
            
            providers.forEach((provider, index) => {
                totalProviders++;
                
                // Test validation
                const isValid = testProviderValidation(provider, index);
                if (isValid) {
                    validProviders++;
                }
            });
        }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 DIAGNOSTIC SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total providers found: ${totalProviders}`);
    console.log(`Valid providers: ${validProviders} (${((validProviders/totalProviders)*100).toFixed(1)}%)`);
    console.log(`Invalid providers: ${totalProviders - validProviders}`);
    
    if (totalProviders - validProviders > 0) {
        console.log('\n🔧 RECOMMENDATIONS:');
        console.log('1. Update the validation schema in utils/security.js to match the actual provider structure');
        console.log('2. Or update the provider structure in providers.json to match the validation schema');
        console.log('3. Consider adding field mapping/normalization in the provider loading process');
    }
}

// Run diagnostics
runDiagnostics().catch(console.error);
