# Security Migration Guide: Environment Variables for API Keys

This guide explains how to migrate from using CSV files with API keys to a secure environment variable-based system.

## Overview

The enhanced security system provides the following benefits:

- 🔒 **Enhanced Security**: API keys are stored in environment variables instead of CSV files
- 🔑 **Key Mapping**: Automatic mapping between provider names and environment variables
- 🛡️ **CSV Deletion**: Ability to securely delete the CSV file after migration
- ✅ **Validation**: Built-in validation of environment variables
- 📊 **Verification**: Security verification scripts to ensure proper setup

## Quick Start

### 1. Extract API Keys to Environment Variables

```bash
node scripts/extract-api-keys-to-env.js
```

This script will:
- Read `providers.csv`
- Extract all API keys
- Create a `.env` file with environment variables
- Create a `key-mapping.json` file for reference
- Generate a shell script to load environment variables

### 2. Review Generated Files

Check the generated files:
- `.env` - Contains all API keys as environment variables
- `key-mapping.json` - Maps provider names to environment variables
- `scripts/load-api-keys.sh` - Shell script to load environment variables

### 3. Load Environment Variables

Option A: Using the generated script:
```bash
./scripts/load-api-keys.sh
```

Option B: Using dotenv in your application:
```javascript
require('dotenv').config();
```

Option C: Exporting manually:
```bash
export $(grep -v "^#" .env | xargs)
```

### 4. Enable Environment Mode

Set the environment variable to enable environment mode:
```bash
export USE_ENV_KEYS=true
```

Or in your application:
```javascript
process.env.USE_ENV_KEYS = 'true';
```

### 5. Verify Security Setup

```bash
node scripts/verify-security-setup.js
```

This script will verify that:
- All required environment variables are set
- Files have proper permissions
- The system is ready for secure operation

### 6. Delete CSV File (Optional but Recommended)

After verifying everything works, you can securely delete the CSV file:
```bash
rm providers.csv
```

## Detailed Usage

### Environment Variable Format

The system automatically converts provider names to environment variable names:

| Provider Name | Environment Variable |
|---------------|---------------------|
| `OpenRouter` | `API_KEY_OPENROUTER` |
| `GitHub_Models` | `API_KEY_GITHUB_MODELS` |
| `Zuki_Journey` | `API_KEY_ZUKI_JOURNEY` |

### Using the Conversion Script

The conversion script now supports two modes:

#### CSV Mode (Default)
```bash
# Reads API keys from CSV file
node csv-to-providers-secure-final.js
```

#### Environment Mode
```bash
# Reads API keys from environment variables
export USE_ENV_KEYS=true
node csv-to-providers-secure-final.js
```

### Using the Test Script

The test script also supports both modes:

#### CSV Mode (Default)
```bash
# Uses API keys from providers.json (generated from CSV)
node test-providers-script.js
```

#### Environment Mode
```bash
# Uses API keys from environment variables
export USE_ENV_KEYS=true
node test-providers-script.js
```

### Security Verification

The security verification script performs comprehensive checks:

```bash
node scripts/verify-security-setup.js
```

Checks performed:
- File existence and permissions
- Environment variable validation
- Security best practices
- Migration completeness

## File Structure

```
Your-PaL-MoE-v0.3/
├── providers.csv                    # Original CSV file (can be deleted after migration)
├── .env                             # Generated environment variables file
├── key-mapping.json                 # Provider to environment variable mapping
├── scripts/
│   ├── extract-api-keys-to-env.js   # Main extraction script
│   ├── key-mapping-utils.js         # Utility functions for key mapping
│   ├── verify-security-setup.js     # Security verification script
│   └── load-api-keys.sh             # Shell script to load environment variables
├── csv-to-providers-secure-final.js # Updated conversion script
└── test-providers-script.js         # Updated test script
```

## Environment Variables

### Required Variables

The system requires the following environment variables to be set:

```bash
# For HuggingFace API integration (optional)
export HF_API_KEY=your_huggingface_api_key

# For OpenAI API (if needed)
export OPENAI_API_KEY=your_openai_api_key

# Provider API keys (generated automatically)
export API_KEY_OPENROUTER=your_openrouter_api_key
export API_KEY_GITHUB_MODELS=your_github_api_key
export API_KEY_ZUKI_JOURNEY=your_zuki_api_key
# ... and more for each provider
```

### Optional Variables

```bash
# Enable environment mode for API keys
export USE_ENV_KEYS=true

# CSV file path (default: ./providers.csv)
export CSV_PATH=./custom-providers.csv

# Output path for generated JSON (default: ./providers.json)
export OUTPUT_PATH=./custom-providers.json

# Logging level
export LOG_LEVEL=debug

# Request timeout in milliseconds
export TIMEOUT_MS=12000

# Number of retry attempts
export RETRIES=2

# Concurrency level
export CONCURRENCY=6
```

## Migration Process

### Step-by-Step Migration

1. **Backup your current setup**
   ```bash
   cp providers.csv providers.csv.backup
   cp providers.json providers.json.backup
   ```

2. **Extract API keys to environment variables**
   ```bash
   node scripts/extract-api-keys-to-env.js
   ```

3. **Review the generated files**
   - Check `.env` file contains all API keys
   - Verify `key-mapping.json` is correct

4. **Test with environment mode**
   ```bash
   export USE_ENV_KEYS=true
   node csv-to-providers-secure-final.js
   node test-providers-script.js
   ```

5. **Verify security setup**
   ```bash
   node scripts/verify-security-setup.js
   ```

6. **Delete CSV file (optional)**
   ```bash
   rm providers.csv
   ```

### Troubleshooting Common Issues

#### Missing Environment Variables

If you get "missing environment variables" errors:

1. Check that `.env` file exists
2. Verify environment variables are loaded:
   ```bash
   node -e "console.log(process.env.API_KEY_OPENROUTER ? '✅ Found' : '❌ Missing')"
   ```
3. Ensure you're using environment mode:
   ```bash
   export USE_ENV_KEYS=true
   ```

#### Key Mapping Issues

If provider names don't match:

1. Check `key-mapping.json` for correct mappings
2. Verify provider names in `providers.csv` match exactly
3. Regenerate the mapping if needed:
   ```bash
   node scripts/extract-api-keys-to-env.js
   ```

#### File Permission Issues

If you get permission errors:

1. Check file permissions:
   ```bash
   ls -la .env key-mapping.json
   ```
2. Fix permissions if needed:
   ```bash
   chmod 600 .env key-mapping.json
   ```

## Security Best Practices

### 1. Environment Variable Security

- Never commit `.env` files to version control
- Add `.env` to your `.gitignore` file
- Use `.env.example` to document required variables
- Set proper file permissions (600 or 644)

### 2. API Key Management

- Regularly rotate API keys
- Monitor API usage for suspicious activity
- Use different keys for different environments
- Revoke keys when no longer needed

### 3. File Security

- Keep `providers.csv` secure during migration
- Delete `providers.csv` after successful migration
- Backup environment variables securely
- Use encrypted storage for sensitive files

### 4. System Security

- Keep dependencies updated
- Implement rate limiting
- Use HTTPS for all communications
- Monitor system logs for suspicious activity

## Rollback Procedure

If you need to rollback to CSV mode:

1. **Disable environment mode**
   ```bash
   unset USE_ENV_KEYS
   ```

2. **Restore CSV file from backup**
   ```bash
   cp providers.csv.backup providers.csv
   ```

3. **Regenerate providers.json**
   ```bash
   node csv-to-providers-secure-final.js
   ```

4. **Test functionality**
   ```bash
   node test-providers-script.js
   ```

## Support

If you encounter issues:

1. Check the security verification script:
   ```bash
   node scripts/verify-security-setup.js
   ```

2. Review the generated security report:
   ```bash
   cat security-report.json
   ```

3. Check logs for detailed error messages:
   ```bash
   node scripts/extract-api-keys-to-env.js 2>&1 | tee extraction.log
   ```

4. Consult the troubleshooting section above

## Conclusion

The enhanced security system provides a robust way to manage API keys using environment variables. By following this guide, you can:

- Improve security by removing sensitive data from CSV files
- Maintain functionality with seamless migration
- Validate your setup with comprehensive verification
- Follow security best practices for API key management

Start with the Quick Start section for a fast migration, or follow the Detailed Usage section for more control over the process.