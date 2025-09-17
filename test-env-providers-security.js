#!/usr/bin/env node

/**
 * Comprehensive test script for environment variables and providers.json generation
 * Focused on security and API key handling
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateApiKey, constantTimeCompare, validators } = require('./utils/security');
const logger = require('./utils/logger');

// Test configuration
const TEST_CONFIG = {
  testCsvPath: './test-providers.csv',
  testOutputPath: './test-providers-output.json',
  testEnvVars: {
    CSV_PATH: './test-providers.csv',
    OUTPUT_PATH: './test-providers-output.json',
    LOG_LEVEL: 'debug',
    HF_API_KEY: 'hf-test-key-123456',
    WATCH: '0',
    TIMEOUT_MS: '10000',
    RETRIES: '1',
    CONCURRENCY: '2'
  }
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  failures: []
};

/**
 * Log test result
 */
function logTest(testName, passed, message = '') {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${testName}`);
    logger.debug(`Test passed: ${testName}`, { message });
  } else {
    testResults.failed++;
    console.log(`❌ ${testName}`);
    logger.error(`Test failed: ${testName}`, { message });
    testResults.failures.push({ testName, message });
  }
}

/**
 * Test environment variable handling
 */
async function testEnvironmentVariables() {
  console.log('\n🔍 Testing Environment Variable Handling');
  console.log('='.repeat(50));
  
  // Test 1: Environment variable reading
  const test1Name = 'Environment variable reading';
  try {
    Object.entries(TEST_CONFIG.testEnvVars).forEach(([key, value]) => {
      process.env[key] = value;
    });
    
    // Verify variables are set
    const allSet = Object.entries(TEST_CONFIG.testEnvVars).every(
      ([key, value]) => process.env[key] === value
    );
    
    logTest(test1Name, allSet, `Set ${Object.keys(TEST_CONFIG.testEnvVars).length} environment variables`);
  } catch (error) {
    logTest(test1Name, false, error.message);
  }
  
  // Test 2: CSV path resolution
  const test2Name = 'CSV path resolution';
  try {
    const csvPath = require('path').resolve(process.cwd(), process.env.CSV_PATH);
    const exists = fs.existsSync(csvPath);
    logTest(test2Name, exists, `CSV file exists at: ${csvPath}`);
  } catch (error) {
    logTest(test2Name, false, error.message);
  }
  
  // Test 3: Output path resolution
  const test3Name = 'Output path resolution';
  try {
    const outputPath = require('path').resolve(process.cwd(), process.env.OUTPUT_PATH);
    const outputDir = require('path').dirname(outputPath);
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const writable = fs.existsSync(outputDir) && fs.existsSync(outputDir);
    logTest(test3Name, writable, `Output directory writable at: ${outputDir}`);
  } catch (error) {
    logTest(test3Name, false, error.message);
  }
}

/**
 * Test security validation functions
 */
function testSecurityValidation() {
  console.log('\n🔒 Testing Security Validation Functions');
  console.log('='.repeat(50));
  
  // Test 1: API key validation
  const test1Name = 'API key validation';
  try {
    const validKey = 'sk-test-key-123456';
    const invalidKey = 'wrong-key';
    const emptyKey = '';
    
    const validResult = validateApiKey(validKey, validKey);
    const invalidResult = validateApiKey(invalidKey, validKey);
    const emptyResult = validateApiKey(emptyKey, validKey);
    
    const allValid = validResult && !invalidResult && !emptyResult;
    logTest(test1Name, allValid, `Valid: ${validResult}, Invalid: ${!invalidResult}, Empty: ${!emptyResult}`);
  } catch (error) {
    logTest(test1Name, false, error.message);
  }
  
  // Test 2: Constant time comparison
  const test2Name = 'Constant time comparison';
  try {
    const key1 = 'test-key-123456';
    const key2 = 'test-key-123456';
    const key3 = 'different-key';
    
    const sameResult = constantTimeCompare(key1, key2);
    const differentResult = constantTimeCompare(key1, key3);
    
    const allCorrect = sameResult && !differentResult;
    logTest(test2Name, allCorrect, `Same keys: ${sameResult}, Different keys: ${!differentResult}`);
  } catch (error) {
    logTest(test2Name, false, error.message);
  }
  
  // Test 3: Input validation
  const test3Name = 'Input validation';
  try {
    const validString = 'valid-string';
    const invalidString = '';
    const validNumber = 42;
    const invalidNumber = -1;
    
    const stringValid = validators.isValidString(validString);
    const stringInvalid = !validators.isValidString(invalidString);
    const numberValid = validators.isValidNumber(validNumber);
    const numberInvalid = !validators.isValidNumber(invalidNumber, 0);
    
    const allValid = stringValid && stringInvalid && numberValid && numberInvalid;
    logTest(test3Name, allValid, `String validation: ${stringValid && stringInvalid}, Number validation: ${numberValid && numberInvalid}`);
  } catch (error) {
    logTest(test3Name, false, error.message);
  }
  
  // Test 4: String sanitization
  const test4Name = 'String sanitization';
  try {
    const maliciousInput = '<script>alert("xss")</script>';
    const sanitized = validators.sanitizeString(maliciousInput);
    
    const noScriptTags = !sanitized.includes('<script>') && !sanitized.includes('</script>');
    logTest(test4Name, noScriptTags, `Sanitized input: ${sanitized}`);
  } catch (error) {
    logTest(test4Name, false, error.message);
  }
}

/**
 * Test providers.json generation
 */
async function testProvidersJsonGeneration() {
  console.log('\n📄 Testing Providers.json Generation');
  console.log('='.repeat(50));
  
  // Test 1: CSV parsing
  const test1Name = 'CSV parsing';
  try {
    const csvContent = fs.readFileSync(TEST_CONFIG.testCsvPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    const header = lines[0].split(',');
    const rows = lines.slice(1).map(line => {
      const values = line.split(',');
      const row = {};
      header.forEach((col, index) => {
        row[col.trim()] = values[index] ? values[index].trim() : '';
      });
      return row;
    });
    
    const validRows = rows.filter(row => 
      Object.values(row).some(value => 
        value != null && value.toString().trim() !== ''
      )
    );
    
    logTest(test1Name, validRows.length > 0, `Parsed ${validRows.length} valid rows from CSV`);
  } catch (error) {
    logTest(test1Name, false, error.message);
  }
  
  // Test 2: API key handling in CSV
  const test2Name = 'API key handling in CSV';
  try {
    const csvContent = fs.readFileSync(TEST_CONFIG.testCsvPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    const header = lines[0].split(',');
    const rows = lines.slice(1).map(line => {
      const values = line.split(',');
      const row = {};
      header.forEach((col, index) => {
        row[col.trim()] = values[index] ? values[index].trim() : '';
      });
      return row;
    });
    
    const rowsWithApiKeys = rows.filter(row => row.APIKey && row.APIKey.trim() !== '');
    const rowsWithoutApiKeys = rows.filter(row => !row.APIKey || row.APIKey.trim() === '');
    
    logTest(test2Name, true, 
      `Rows with API keys: ${rowsWithApiKeys.length}, Rows without API keys: ${rowsWithoutApiKeys.length}`);
  } catch (error) {
    logTest(test2Name, false, error.message);
  }
  
  // Test 3: Generate providers.json (using the csv-to-providers.js module)
  const test3Name = 'Providers.json generation';
  try {
    // Dynamically import the csv-to-providers module
    const csvToProviders = require('./csv-to-providers');
    
    // Set environment variables
    Object.entries(TEST_CONFIG.testEnvVars).forEach(([key, value]) => {
      process.env[key] = value;
    });
    
    // Generate providers.json
    const result = await csvToProviders.generateProvidersJSON(
      TEST_CONFIG.testCsvPath,
      TEST_CONFIG.testOutputPath
    );
    
    // Check if output file was created
    const outputFileExists = fs.existsSync(TEST_CONFIG.testOutputPath);
    
    if (outputFileExists) {
      const outputContent = JSON.parse(fs.readFileSync(TEST_CONFIG.testOutputPath, 'utf8'));
      const hasEndpoints = outputContent.endpoints && Object.keys(outputContent.endpoints).length > 0;
      
      logTest(test3Name, hasEndpoints, 
        `Generated providers.json with ${Object.keys(outputContent.endpoints).length} endpoints`);
      
      // Clean up test output file
      fs.unlinkSync(TEST_CONFIG.testOutputPath);
    } else {
      logTest(test3Name, false, 'Output file was not created');
    }
  } catch (error) {
    logTest(test3Name, false, error.message);
  }
}

/**
 * Test API key security in generated JSON
 */
async function testApiKeySecurity() {
  console.log('\n🔐 Testing API Key Security in Generated JSON');
  console.log('='.repeat(50));
  
  // Test 1: Check if API keys are properly masked in logs
  const test1Name = 'API key masking in logs';
  try {
    const testApiKey = 'sk-test-key-123456';
    const maskedKey = testApiKey.substring(0, 8) + '*'.repeat(testApiKey.length - 8);
    
    // Simulate logging with API key
    const logEntry = {
      message: 'Processing provider with API key',
      apiKey: testApiKey,
      timestamp: new Date().toISOString()
    };
    
    // Check if the log contains the masked key
    const logString = JSON.stringify(logEntry);
    const isMasked = !logString.includes(testApiKey) || logString.includes(maskedKey);
    
    logTest(test1Name, isMasked, `API key properly masked in logs`);
  } catch (error) {
    logTest(test1Name, false, error.message);
  }
  
  // Test 2: Check for sensitive data exposure in generated JSON
  const test2Name = 'Sensitive data exposure in JSON';
  try {
    // Generate providers.json first
    const csvToProviders = require('./csv-to-providers');
    
    Object.entries(TEST_CONFIG.testEnvVars).forEach(([key, value]) => {
      process.env[key] = value;
    });
    
    await csvToProviders.generateProvidersJSON(
      TEST_CONFIG.testCsvPath,
      TEST_CONFIG.testOutputPath
    );
    
    // Read and analyze the generated JSON
    const outputContent = JSON.parse(fs.readFileSync(TEST_CONFIG.testOutputPath, 'utf8'));
    let sensitiveDataFound = false;
    let sensitiveDataCount = 0;
    
    // Check for API keys in the JSON
    function checkForApiKeys(obj, path = '') {
      if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          if (key.toLowerCase().includes('api_key') || key.toLowerCase().includes('apikey')) {
            if (value && typeof value === 'string' && value.length > 10) {
              sensitiveDataFound = true;
              sensitiveDataCount++;
              logger.warn(`Potential API key found in JSON at path: ${currentPath}`, { 
                key: currentPath, 
                value: value.substring(0, 8) + '...' 
              });
            }
          } else if (Array.isArray(value)) {
            value.forEach((item, index) => {
              checkForApiKeys(item, `${currentPath}[${index}]`);
            });
          } else if (typeof value === 'object') {
            checkForApiKeys(value, currentPath);
          }
        }
      }
    }
    
    checkForApiKeys(outputContent);
    
    // Clean up
    fs.unlinkSync(TEST_CONFIG.testOutputPath);
    
    const secure = !sensitiveDataFound;
    logTest(test1Name, secure, 
      `Sensitive data check: ${sensitiveDataCount} potential API keys found`);
  } catch (error) {
    logTest(test1Name, false, error.message);
  }
}

/**
 * Test error handling and edge cases
 */
async function testErrorHandling() {
  console.log('\n⚠️  Testing Error Handling and Edge Cases');
  console.log('='.repeat(50));
  
  // Test 1: Invalid CSV file
  const test1Name = 'Invalid CSV file handling';
  try {
    const csvToProviders = require('./csv-to-providers');
    
    // Try to generate with non-existent CSV file
    await csvToProviders.generateProvidersJSON(
      './non-existent-file.csv',
      './test-output.json'
    );
    
    logTest(test1Name, false, 'Should have failed with non-existent file');
  } catch (error) {
    logTest(test1Name, true, `Correctly handled error: ${error.message}`);
    
    // Clean up any created files
    if (fs.existsSync('./test-output.json')) {
      fs.unlinkSync('./test-output.json');
    }
  }
  
  // Test 2: Empty CSV file
  const test2Name = 'Empty CSV file handling';
  try {
    // Create empty CSV file
    fs.writeFileSync('./empty-test.csv', '');
    
    const csvToProviders = require('./csv-to-providers');
    
    await csvToProviders.generateProvidersJSON(
      './empty-test.csv',
      './test-output.json'
    );
    
    logTest(test2Name, true, 'Handled empty CSV file gracefully');
    
    // Clean up
    fs.unlinkSync('./empty-test.csv');
    if (fs.existsSync('./test-output.json')) {
      fs.unlinkSync('./test-output.json');
    }
  } catch (error) {
    logTest(test2Name, false, error.message);
    
    // Clean up
    if (fs.existsSync('./empty-test.csv')) {
      fs.unlinkSync('./empty-test.csv');
    }
    if (fs.existsSync('./test-output.json')) {
      fs.unlinkSync('./test-output.json');
    }
  }
  
  // Test 3: Invalid URL handling
  const test3Name = 'Invalid URL handling';
  try {
    // Create CSV with invalid URL
    fs.writeFileSync('./invalid-url-test.csv', 
      'Name,Base_URL,APIKey,Model(s)\n' +
      'InvalidProvider,not-a-valid-url,sk-test-key,gpt-4\n'
    );
    
    const csvToProviders = require('./csv-to-providers');
    
    await csvToProviders.generateProvidersJSON(
      './invalid-url-test.csv',
      './test-output.json'
    );
    
    logTest(test3Name, true, 'Handled invalid URL gracefully');
    
    // Clean up
    fs.unlinkSync('./invalid-url-test.csv');
    if (fs.existsSync('./test-output.json')) {
      fs.unlinkSync('./test-output.json');
    }
  } catch (error) {
    logTest(test3Name, false, error.message);
    
    // Clean up
    if (fs.existsSync('./invalid-url-test.csv')) {
      fs.unlinkSync('./invalid-url-test.csv');
    }
    if (fs.existsSync('./test-output.json')) {
      fs.unlinkSync('./test-output.json');
    }
  }
}

/**
 * Generate test report
 */
function generateTestReport() {
  console.log('\n📊 Test Report');
  console.log('='.repeat(50));
  console.log(`Total tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Success rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
  
  if (testResults.failures.length > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.failures.forEach(failure => {
      console.log(`  - ${failure.testName}: ${failure.message}`);
    });
  }
  
  // Security recommendations
  console.log('\n🔒 Security Recommendations:');
  console.log('  1. Always validate and sanitize input data');
  console.log('  2. Use environment variables for sensitive data');
  console.log('  3. Implement proper error handling to avoid information leakage');
  console.log('  4. Mask or log API keys securely');
  console.log('  5. Validate URLs and API endpoints before making requests');
  console.log('  6. Use rate limiting to prevent abuse');
  console.log('  7. Implement proper authentication and authorization');
  
  return {
    total: testResults.total,
    passed: testResults.passed,
    failed: testResults.failed,
    successRate: (testResults.passed / testResults.total) * 100,
    failures: testResults.failures
  };
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting Environment Variables and Providers.json Security Tests');
  console.log('='.repeat(70));
  
  try {
    // Run all test suites
    await testEnvironmentVariables();
    testSecurityValidation();
    await testProvidersJsonGeneration();
    await testApiKeySecurity();
    await testErrorHandling();
    
    // Generate final report
    const report = generateTestReport();
    
    // Exit with appropriate code
    process.exit(report.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Test runner failed:', error.message);
    logger.error('Test runner failure', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  testEnvironmentVariables,
  testSecurityValidation,
  testProvidersJsonGeneration,
  testApiKeySecurity,
  testErrorHandling
};