#!/usr/bin/env node

/**
 * Security verification script to ensure environment variables are properly set
 * and the system is ready for secure operation
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { validateEnvironmentVariables, getLoadedEnvironmentVariables, generateEnvironmentDocumentation } = require('./key-mapping-utils');

// Configuration
const CSV_PATH = path.resolve(process.cwd(), 'providers.csv');
const KEY_MAPPING_FILE = path.resolve(process.cwd(), 'key-mapping.json');
const ENV_FILE_PATH = path.resolve(process.cwd(), '.env');

// Results tracking
const results = {
  checks: [],
  passed: 0,
  failed: 0,
  warnings: 0
};

/**
 * Log function with timestamp
 */
function log(level, ...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}]`, ...args);
  
  // Track results
  results.checks.push({
    timestamp,
    level,
    message: args.join(' ')
  });
  
  if (level === 'error') results.failed++;
  else if (level === 'warn') results.warnings++;
  else if (level === 'info') results.passed++;
}

/**
 * Check if file exists and is readable
 */
function checkFileExists(filePath, description) {
  try {
    if (fs.existsSync(filePath)) {
      log('info', `✅ ${description} exists: ${filePath}`);
      return true;
    } else {
      log('warn', `❌ ${description} not found: ${filePath}`);
      return false;
    }
  } catch (error) {
    log('error', `❌ Error checking ${description}: ${error.message}`);
    return false;
  }
}

/**
 * Check if file is secure (not world-readable)
 */
function checkFileSecurity(filePath, description) {
  try {
    if (!fs.existsSync(filePath)) {
      log('warn', `⚠️  ${description} not found, cannot check security: ${filePath}`);
      return false;
    }
    
    const stats = fs.statSync(filePath);
    const isSecure = (stats.mode & 0o077) === 0; // Check if group/others have no permissions
    
    if (isSecure) {
      log('info', `✅ ${description} has secure permissions: ${stats.mode.toString(8)}`);
      return true;
    } else {
      log('error', `❌ ${description} has insecure permissions: ${stats.mode.toString(8)}`);
      return false;
    }
  } catch (error) {
    log('error', `❌ Error checking ${description} security: ${error.message}`);
    return false;
  }
}

/**
 * Check environment variables
 */
function checkEnvironmentVariables() {
  log('info', '🔍 Checking environment variables...');
  
  const validation = validateEnvironmentVariables();
  
  if (validation.isValid) {
    log('info', `✅ All ${validation.total} environment variables are properly set`);
    
    const loaded = getLoadedEnvironmentVariables();
    loaded.forEach(item => {
      log('info', `  - ${item.provider}: ${item.envVar} (${item.isLoaded ? '✅ Loaded' : '❌ Missing'})`);
    });
    
    return true;
  } else {
    log('error', `❌ ${validation.missing.length} out of ${validation.total} environment variables are missing`);
    
    validation.missing.forEach(item => {
      log('error', `  - ${item.provider}: ${item.envVar} (Expected: ${item.maskedKey})`);
    });
    
    return false;
  }
}

/**
 * Check if CSV file should be deleted
 */
function checkCsvSecurity() {
  log('info', '🔍 Checking CSV file security...');
  
  const csvExists = fs.existsSync(CSV_PATH);
  const envExists = fs.existsSync(ENV_FILE_PATH);
  const mappingExists = fs.existsSync(KEY_MAPPING_FILE);
  
  if (!csvExists) {
    log('info', '✅ providers.csv not found (already deleted or never existed)');
    return true;
  }
  
  if (!envExists || !mappingExists) {
    log('warn', '⚠️  providers.csv exists but .env or key-mapping.json not found');
    log('warn', '   Run extract-api-keys-to-env.js to migrate to environment variables');
    return false;
  }
  
  // Check if environment variables are properly set
  const validation = validateEnvironmentVariables();
  if (validation.isValid) {
    log('warn', '⚠️  providers.csv still exists but environment variables are set');
    log('warn', '   For security, consider deleting providers.csv');
    return false;
  } else {
    log('error', '❌ providers.csv exists but environment variables are not properly set');
    log('error', '   Please run extract-api-keys-to-env.js first');
    return false;
  }
}

/**
 * Generate security report
 */
function generateSecurityReport() {
  try {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalChecks: results.checks.length,
        passed: results.passed,
        failed: results.failed,
        warnings: results.warnings,
        securityScore: calculateSecurityScore()
      },
      checks: results.checks,
      recommendations: generateRecommendations()
    };
    
    const reportPath = path.resolve(process.cwd(), 'security-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log('info', `📊 Security report saved to: ${reportPath}`);
    
    return report;
  } catch (error) {
    log('error', `❌ Failed to generate security report: ${error.message}`);
    return null;
  }
}

/**
 * Calculate security score (0-100)
 */
function calculateSecurityScore() {
  const total = results.passed + results.failed + results.warnings;
  if (total === 0) return 0;
  
  // Weight: passed = 1, warnings = 0.5, failed = 0
  const score = (results.passed * 1 + results.warnings * 0.5) / total * 100;
  return Math.round(score);
}

/**
 * Generate security recommendations
 */
function generateRecommendations() {
  const recommendations = [];
  
  if (results.failed > 0) {
    recommendations.push({
      priority: 'high',
      category: 'Critical Security Issues',
      items: results.checks
        .filter(check => check.level === 'error')
        .map(check => check.message)
    });
  }
  
  if (results.warnings > 0) {
    recommendations.push({
      priority: 'medium',
      category: 'Security Improvements',
      items: results.checks
        .filter(check => check.level === 'warn')
        .map(check => check.message)
    });
  }
  
  // Add general recommendations
  recommendations.push({
    priority: 'low',
    category: 'Best Practices',
    items: [
      'Regularly rotate API keys',
      'Monitor API usage for suspicious activity',
      'Keep dependencies updated',
      'Implement rate limiting',
      'Use HTTPS for all communications'
    ]
  });
  
  return recommendations;
}

/**
 * Main function
 */
async function main() {
  log('info', '🔒 Starting security verification...');
  
  try {
    // Check required files
    const csvExists = checkFileExists(CSV_PATH, 'providers.csv');
    const envExists = checkFileExists(ENV_FILE_PATH, '.env file');
    const mappingExists = checkFileExists(KEY_MAPPING_FILE, 'key-mapping.json');
    
    // Check file security
    if (envExists) checkFileSecurity(ENV_FILE_PATH, '.env file');
    if (mappingExists) checkFileSecurity(KEY_MAPPING_FILE, 'key-mapping.json');
    
    // Check environment variables
    const envValid = checkEnvironmentVariables();
    
    // Check CSV security
    const csvSecure = checkCsvSecurity();
    
    // Generate security report
    const report = generateSecurityReport();
    
    // Summary
    log('info', '\n=== SECURITY VERIFICATION SUMMARY ===');
    log('info', `Total checks: ${results.checks.length}`);
    log('info', `Passed: ${results.passed}`);
    log('info', `Warnings: ${results.warnings}`);
    log('info', `Failed: ${results.failed}`);
    log('info', `Security Score: ${calculateSecurityScore()}/100`);
    
    if (report && report.summary.securityScore >= 80) {
      log('info', '\n✅ Security verification PASSED - System is secure');
      process.exit(0);
    } else if (report && report.summary.securityScore >= 50) {
      log('warn', '\n⚠️  Security verification PARTIAL - Some issues found');
      process.exit(1);
    } else {
      log('error', '\n❌ Security verification FAILED - Critical issues found');
      process.exit(1);
    }
    
  } catch (error) {
    log('error', 'Fatal error during security verification:', error.message);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  checkFileExists,
  checkFileSecurity,
  checkEnvironmentVariables,
  checkCsvSecurity,
  generateSecurityReport,
  calculateSecurityScore
};