# Your-PaL-MoE - AI Provider Management System

A comprehensive system for managing multiple AI providers with enhanced security features and environment variable-based API key management.

## 🚀 Features

- **Multi-Provider Support**: Support for 15+ AI providers including OpenRouter, GitHub Models, Zuki Journey, and more
- **Enhanced Security**: API keys managed through environment variables instead of CSV files
- **Automatic Key Mapping**: Seamless mapping between provider names and environment variables
- **Model Search Integration**: HuggingFace API integration for model discovery and capability detection
- **Security Verification**: Built-in security validation and reporting
- **Hot Reload Support**: File watching for automatic regeneration when CSV changes
- **Comprehensive Testing**: Built-in test scripts for provider validation

## 📋 Prerequisites

- Node.js 16+ 
- npm or yarn
- API keys for the providers you want to use
- HuggingFace API token (for model search functionality)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Your-PaL-MoE-v0.3
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create Your providers.csv File

Create a `providers.csv` file with your AI provider configurations:

```csv
Name,Base_URL,APIKey,Model(s)
OpenRouter,https://openrouter.ai/api/v1,sk-or-v1-your-api-key,gpt-4|claude-3-sonnet
GitHub_Models,https://github.com/marketplace/models/{registry}/{id},github_pat-your-token,gpt-4|claude-3
```

### 4. Generate Environment Variables from CSV

Run the extraction script to convert your CSV API keys to environment variables:

```bash
node scripts/extract-api-keys-to-env.js
```

This will automatically generate:
- `.env` file with all provider API keys as environment variables
- `key-mapping.json` for reference
- `scripts/load-api-keys.sh` to load environment variables

### 5. Manually Add Your HuggingFace API Key

Edit the generated `.env` file and add your HuggingFace API key:

```bash
# Add this line to your .env file (replace with your actual token)
HF_API_KEY=hf_your_actual_huggingface_token
```

### 6. Set Secure File Permissions

```bash
chmod 600 .env key-mapping.json
```

### 7. Verify Security Setup

```bash
export USE_ENV_KEYS=true
node scripts/verify-security-setup.js
```

## 🔧 Usage

### Basic Usage

```bash
# Enable environment mode for API key management
export USE_ENV_KEYS=true

# Generate secured providers.json from environment variables
node csv-to-providers-secure-final.js

# Test all configured providers
node test-providers-script.js
```

### Using the Environment Loader

```bash
# Load all environment variables from the generated script
./scripts/load-api-keys.sh

# Then run your application
node your-app.js
```

### Development Mode with Hot Reload

```bash
# Enable hot reload and environment mode
export USE_ENV_KEYS=true
export WATCH=1
export LOG_LEVEL=debug
node csv-to-providers-secure-final.js
```

## 📁 Project Structure

```
Your-PaL-MoE-v0.3/
├── providers.csv                    # User-provided provider configuration (delete after migration)
├── providers.json                   # Generated provider configuration
├── .env                             # Environment variables (auto-generated)
├── key-mapping.json                 # Provider to environment variable mapping
├── scripts/
│   ├── extract-api-keys-to-env.js   # API key extraction script
│   ├── key-mapping-utils.js         # Key mapping utilities
│   ├── verify-security-setup.js     # Security verification script
│   └── load-api-keys.sh             # Environment loader script
├── csv-to-providers-secure-final.js # Main conversion script
├── test-providers-script.js         # Provider testing script
└── README.md                        # This file
```

## 🔐 Security Features

### Environment Variable Management

- **Provider API Keys**: Automatically extracted from CSV and converted to environment variables
- **System API Keys**: Manual configuration for keys like HF_API_KEY
- **Key Mapping**: Automatic mapping between provider names and environment variables
- **Secure Storage**: API keys never stored in source code or version control

### Security Verification

The system includes comprehensive security validation:

```bash
node scripts/verify-security-setup.js
```

Checks performed:
- Environment variable validation
- File permission verification
- Security best practices compliance
- Migration completeness assessment

### Security Best Practices

1. **Never commit `.env` files** to version control
2. **Add `.env` to `.gitignore`**:
   ```bash
   echo ".env" >> .gitignore
   ```
3. **Use proper file permissions**: `chmod 600 .env`
4. **Delete providers.csv** after successful migration
5. **Regularly rotate API keys**
6. **Monitor API usage** for suspicious activity

## 🧪 Testing

### Provider Testing

Test all configured providers:

```bash
export USE_ENV_KEYS=true
node test-providers-script.js
```

This will:
- Test each provider with a sample prompt
- Generate test results and reports
- Save detailed logs for analysis

### Security Testing

Run comprehensive security tests:

```bash
export USE_ENV_KEYS=true
node scripts/verify-security-setup.js
```

## 🔧 Configuration

### Environment Variables

#### Required Variables

```bash
# HuggingFace API Key (required for model search)
HF_API_KEY=hf_your_huggingface_token

# Provider API Keys (auto-generated or manual)
API_KEY_OPENROUTER=your-openrouter-key
API_KEY_GITHUB_MODELS=your-github-key
# ... other provider keys
```

#### Optional Variables

```bash
# Enable environment mode for API keys
USE_ENV_KEYS=true

# CSV file path (default: ./providers.csv)
CSV_PATH=./custom-providers.csv

# Output path for generated JSON (default: ./providers.json)
OUTPUT_PATH=./custom-providers.json

# Logging level
LOG_LEVEL=debug

# Request timeout in milliseconds
TIMEOUT_MS=12000

# Number of retry attempts
RETRIES=2

# Concurrency level
CONCURRENCY=6

# Enable hot reload
WATCH=1
```

### CSV Configuration Format

```csv
Name,Base_URL,APIKey,Model(s)
ProviderName,https://api.example.com/v1,sk-your-key,model1|model2|model3
```

## 📊 Monitoring and Logging

### Log Levels

- `error`: Only errors
- `warn`: Warnings and errors
- `info`: Information, warnings, and errors (default)
- `debug`: All logging

### Log Files

- Application logs: `logs/app.log`
- Test results: `test-results-<timestamp>.json`
- Security reports: `security-report.json`

## 🚀 Deployment

### Production Setup

1. **Set environment variables**:
   ```bash
   export USE_ENV_KEYS=true
   export LOG_LEVEL=info
   export TIMEOUT_MS=15000
   ```

2. **Verify security**:
   ```bash
   node scripts/verify-security-setup.js
   ```

3. **Delete sensitive files**:
   ```bash
   rm providers.csv
   chmod 600 .env key-mapping.json
   ```

4. **Start your application**:
   ```bash
   node your-app.js
   ```

### Docker Deployment

```dockerfile
FROM node:16-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN rm providers.csv
RUN chmod 600 .env

EXPOSE 3000
CMD ["node", "your-app.js"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Ensure security best practices
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support and Troubleshooting

### Common Issues

#### Missing Environment Variables

```bash
# Check if environment variables are loaded
node -e "console.log('HF_API_KEY:', process.env.HF_API_KEY ? '✅ Set' : '❌ Missing')"

# Load environment variables
./scripts/load-api-keys.sh
```

#### Permission Issues

```bash
# Fix file permissions
chmod 600 .env key-mapping.json
chmod 755 scripts/load-api-keys.sh
```

#### Provider Testing Failures

```bash
# Run with debug logging
export LOG_LEVEL=debug
export USE_ENV_KEYS=true
node test-providers-script.js
```

### Getting Help

1. Check the generated `security-report.json` for detailed analysis
2. Review test logs in `test-results-*.json` files
3. Consult the troubleshooting section in the migration guide
4. Open an issue with detailed error logs

## 🔄 Migration from CSV to Environment Variables

For detailed migration instructions, see [`docs/security/migration-guide.md`](docs/security/migration-guide.md).

### Quick Migration

```bash
# 1. Extract API keys to environment variables
node scripts/extract-api-keys-to-env.js

# 2. Add your HuggingFace API key
echo "HF_API_KEY=hf_your_token" >> .env

# 3. Set permissions
chmod 600 .env key-mapping.json

# 4. Verify security
export USE_ENV_KEYS=true
node scripts/verify-security-setup.js

# 5. Delete CSV file (after verification)
rm providers.csv
```

## 🎯 Roadmap

- [ ] Add more AI providers
- [ ] Implement rate limiting
- [ ] Add usage analytics
- [ ] Create web dashboard
- [ ] Add automated key rotation
- [ ] Implement caching for model searches

---

**Note**: This system is designed for educational and development purposes. Always follow security best practices when handling API keys and sensitive information in production environments.
