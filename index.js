require("dotenv").config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const multer = require('multer');
const FormData = require('form-data');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const securityMiddleware = require('./security-middleware');
const enhancedAuth = require('./enhanced-auth');
const { errorHandler, notFoundHandler, asyncHandler, errorMonitor } = require('./error-handler');
const securityValidator = require('./security-validation-utils').securityValidator;
const securityAuditLogger = require('./security-audit-logger').securityAuditLogger;
const healthCheckService = require('./health-check').healthCheckService;

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 2715;
const HOST = '0.0.0.0';
const CONFIG_FILE = 'providers.json';
const USERS_CONFIG_FILE = 'users.json';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const STATIC_DIRECTORY = __dirname;
const SECURITY_CONFIG_FILE = 'security-config.json';
const JWT_SECRET = crypto.randomBytes(32).toString('hex');
const API_KEY_SALT = crypto.randomBytes(16).toString('hex');

// Load security configuration template
const securityTemplate = require('./config/security-template');

// Default security configuration
let securityConfig = {
  ...securityTemplate,
  enableApiKeyRotation: process.env.ENABLE_API_KEY_ROTATION !== 'false',
  apiKeyRotationInterval: parseInt(process.env.API_KEY_ROTATION_INTERVAL) || 86400000, // 24 hours in milliseconds
  enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  enableIpWhitelist: process.env.ENABLE_IP_WHITELIST !== 'false',
  ipWhitelist: process.env.IP_WHITELIST ? JSON.parse(process.env.IP_WHITELIST) : ['127.0.0.1', '::1'],
  enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false',
  maskSensitiveHeaders: process.env.MASK_SENSITIVE_HEADERS !== 'false',
  enableHelmet: process.env.ENABLE_HELMET !== 'false',
  enableCSP: process.env.ENABLE_CSP !== 'false',
  allowedOrigins: process.env.ALLOWED_ORIGINS ? JSON.parse(process.env.ALLOWED_ORIGINS) : ['*'],
  enableApiKeyExpiry: process.env.ENABLE_API_KEY_EXPIRY !== 'false',
  defaultExpiryDays: parseInt(process.env.DEFAULT_KEY_EXPIRY_DAYS) || 30,
  enableScopes: process.env.ENABLE_PERMISSION_SCOPES !== 'false'
};

let providersConfig = { endpoints: {} };
let usersConfig = { users: {} };
let availableModelsList = [];



/**
 * Writes user configuration to a file.
 * @param {object} configData - The user configuration object to save.
 * @returns {Promise<boolean>} True if save was successful, false otherwise.
 */
async function saveUsersConfig(configData) {
    try {
        await writeFileAsync(USERS_CONFIG_FILE, JSON.stringify(configData, null, 4));
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Parses a plan string (e.g., "500k", "100m", "unlimited") and returns the daily token limit.
 * @param {string} planStr - The plan string.
 * @returns {number|null} The daily token limit, or null for unlimited.
 */
function getDailyLimitFromPlan(planStr) {
    if (typeof planStr !== 'string') {
        return 0;
    }
    planStr = planStr.toLowerCase().trim();

    if (planStr === 'unlimited') {
        return null;
    }

    let multiplier = 1;
    if (planStr.endsWith('k')) {
        multiplier = 1000;
        planStr = planStr.slice(0, -1);
    } else if (planStr.endsWith('m')) {
        multiplier = 1_000_000;
        planStr = planStr.slice(0, -1);
    } else if (planStr.endsWith('b')) {
        multiplier = 1_000_000_000;
        planStr = planStr.slice(0, -1);
    }

    try {
        const limit = parseFloat(planStr) * multiplier;
        return parseInt(limit, 10);
    } catch (error) {
        return 0;
    }
}

/**
 * Checks if a new UTC day has started since the last given timestamp.
 * @param {number} lastTimestamp - The last usage timestamp (Unix seconds).
 * @returns {boolean} True if it's a new UTC day, false otherwise.
 */
function isNewDay(lastTimestamp) {
    if (!lastTimestamp) {
        return true;
    }
    const nowUtc = new Date();
    nowUtc.setUTCHours(0, 0, 0, 0);

    const lastTimeUtc = new Date(lastTimestamp * 1000);
    lastTimeUtc.setUTCHours(0, 0, 0, 0);

    return nowUtc.getTime() > lastTimeUtc.getTime();
}

/**
 * Updates the token usage count for a given API key.
 * Resets daily counts if a new day has started.
 * @param {string} apiKey - The user's API key.
 * @param {number} tokensUsed - The number of tokens used in the current request.
 * @param {number} [tokenMultiplier=1.0] - A multiplier to adjust the token count (e.g., for different model costs).
 */
async function updateUserTokenCount(apiKey, tokensUsed, tokenMultiplier = 1.0) {
    if (typeof tokensUsed !== 'number' || tokensUsed < 0) {
        return;
    }

    if (typeof tokenMultiplier !== 'number' || tokenMultiplier < 0) {
        tokenMultiplier = 1.0;
    }

    const adjustedTokensUsed = Math.ceil(tokensUsed * tokenMultiplier);

    let currentUsersConfig = { users: {} };
    try {
        const data = await readFileAsync(USERS_CONFIG_FILE, 'utf8');
        currentUsersConfig = JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT') {
        } else if (e instanceof SyntaxError) {
            currentUsersConfig = usersConfig;
        } else {
            currentUsersConfig = usersConfig;
        }
    }

    const user_data = currentUsersConfig.users[apiKey];

    if (user_data) {
        const nowTs = Math.floor(Date.now() / 1000);

        let total_tokens = user_data.total_tokens || 0;
        let daily_tokens_used = user_data.daily_tokens_used || 0;
        let last_usage_timestamp = user_data.last_usage_timestamp;

        if (isNewDay(last_usage_timestamp)) {
            daily_tokens_used = adjustedTokensUsed;
        } else {
            daily_tokens_used += adjustedTokensUsed;
        }

        user_data.total_tokens = total_tokens + adjustedTokensUsed;
        user_data.daily_tokens_used = daily_tokens_used;
        user_data.last_usage_timestamp = nowTs;
        user_data.last_updated_timestamp = nowTs;


        usersConfig = currentUsersConfig;

        if (!(await saveUsersConfig(currentUsersConfig))) {
        }
    } else {
    }
}


/**
 * Generates a list of available models from the provider configuration.
 * This list is used for the /v1/models endpoint.
 * @param {object} config - The loaded provider configuration.
 * @returns {Array<object>} A list of model objects.
 * @private
 */
function _generateModelsList(config) {
    const modelsData = {};
    const currentTime = Math.floor(Date.now() / 1000);

    if (config && config.endpoints) {
        for (const endpointPath in config.endpoints) {
            const endpointDetails = config.endpoints[endpointPath];
            if (endpointDetails.models) {
                for (const modelId in endpointDetails.models) {
                    const providersList = endpointDetails.models[modelId];
                    if (!providersList) {
                        continue;
                    }
                    if (!modelsData[modelId]) {
                        let owner = "unknown";
                        let tokenMultiplier = 1.0;

                        if (providersList.length > 0 && typeof providersList === 'object') {
                            if (providersList.owner) {
                                owner = providersList.owner;
                            }
                            const provMultiplier = providersList.token_multiplier;
                            if (typeof provMultiplier === 'number' && provMultiplier >= 0) {
                                tokenMultiplier = provMultiplier;
                            } else {
                                tokenMultiplier = 1.0;
                            }
                        }

                        modelsData[modelId] = {
                            id: modelId,
                            object: 'model',
                            created: currentTime,
                            owned_by: owner,
                            token_multiplier: tokenMultiplier,
                            endpoint: endpointPath
                        };
                    }
                }
            }
        }
    }
    return Object.values(modelsData);
}

/**
 * Loads provider and user configurations from their respective JSON files.
 * Initializes the `providersConfig`, `usersConfig`, and `availableModelsList`.
 * @returns {Promise<{providersConfig: object, usersConfig: object}>} The loaded configurations.
 */
async function loadConfigurations() {
    let loadedProvidersConfig = { endpoints: {} };
    try {
        const data = await readFileAsync(CONFIG_FILE, 'utf8');
        loadedProvidersConfig = JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT') {
        } else if (e instanceof SyntaxError) {
        } else {
        }
    }

    let loadedUsersConfig = { users: {} };
    try {
        const data = await readFileAsync(USERS_CONFIG_FILE, 'utf8');
        loadedUsersConfig = JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT') {
        } else if (e instanceof SyntaxError) {
        } else {
        }
    }

    // Load security configuration
    try {
        const securityData = await readFileAsync(SECURITY_CONFIG_FILE, 'utf8');
        const loadedSecurityConfig = JSON.parse(securityData);
        securityConfig = { ...securityConfig, ...loadedSecurityConfig };
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.warn('Failed to load security configuration, using defaults');
        }
    }

    providersConfig = loadedProvidersConfig;
    usersConfig = loadedUsersConfig;
    availableModelsList = _generateModelsList(providersConfig);

    // Update app.locals for middleware access
    app.locals.providersConfig = providersConfig;
    app.locals.usersConfig = usersConfig;
    app.locals.securityConfig = securityConfig;

    return { providersConfig, usersConfig };
}

const app = express();

// Store configurations in app.locals for middleware access
app.locals.securityConfig = securityConfig;
app.locals.usersConfig = usersConfig;

// Apply security middleware
app.use(securityMiddleware.configureSecurityHeaders(app, securityConfig));
app.use(securityMiddleware.configureCORS(app, securityConfig));
app.use(securityMiddleware.requestLogging);
app.use(securityMiddleware.validateInput);
app.use(securityMiddleware.preventPathTraversal);

// Apply compression middleware
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// Apply request size limiting
app.use(express.json({
    limit: process.env.BODY_PARSER_LIMIT || '10mb',
    verify: (req, res, buf, encoding) => {
        if (buf.length > 1024 * 1024) { // 1MB limit
            throw new Error('Request entity too large');
        }
    }
}));

// Apply enhanced authentication middleware
app.use(enhancedAuth.createAuthMiddleware(securityConfig, usersConfig));

// Apply compression middleware
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// Apply request size limiting
app.use(express.json({
    limit: process.env.BODY_PARSER_LIMIT || '10mb',
    verify: (req, res, buf, encoding) => {
        if (buf.length > 1024 * 1024) { // 1MB limit
            throw new Error('Request entity too large');
        }
    }
}));

app.use(express.static(STATIC_DIRECTORY));

// Add health check endpoint
app.get('/health', asyncHandler(async (req, res) => {
  try {
    const healthResults = await healthCheckService.runAllChecks();
    res.status(healthResults.status === 'healthy' ? 200 : 503).json(healthResults);
  } catch (error) {
    const errorResponse = {
      timestamp: new Date().toISOString(),
      status: 'unhealthy',
      error: {
        message: 'Health check failed',
        details: error.message
      }
    };
    res.status(503).json(errorResponse);
  }
}));

// Add security audit endpoint (admin only)
app.get('/admin/security-audit', asyncHandler(async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let providedApiKey = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      providedApiKey = authHeader.split(' ')[1];
    }

    if (providedApiKey !== ADMIN_API_KEY) {
      throw new SecurityError('Forbidden: Invalid admin API key.', 403);
    }

    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const logFile = `./logs/security-audit/security-audit-${dateStr}.log`;
    
    if (fs.existsSync(logFile)) {
      const auditLogs = await fs.readFile(logFile, 'utf8');
      res.status(200).json({
        date: dateStr,
        logs: auditLogs.split('\n').filter(line => line.trim()).map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return { raw: line };
          }
        })
      });
    } else {
      res.status(404).json({
        error: 'No audit logs found for the specified date',
        date: dateStr
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve audit logs',
      details: error.message
    });
  }
}));


/**
 * Express middleware for authenticating requests based on API keys in `users.json`.
 * Checks for API key validity, enabled status, and daily token limits.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 */
/**
 * Generates a secure API key.
 * @returns {string} A new API key.
 */
function generateApiKey() {
    return `sk-${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Hashes an API key for storage.
 * @param {string} apiKey - The API key to hash.
 * @returns {string} The hashed API key.
 */
function hashApiKey(apiKey) {
    return crypto.createHmac('sha256', API_KEY_SALT)
        .update(apiKey)
        .digest('hex');
}

/**
 * Checks if an API key needs rotation.
 * @param {object} user - The user object.
 * @returns {boolean} True if rotation is needed.
 */
function needsApiKeyRotation(user) {
    if (!securityConfig.enableApiKeyRotation) return false;
    if (!user.last_rotation_timestamp) return true;
    
    const timeSinceLastRotation = Date.now() - user.last_rotation_timestamp;
    return timeSinceLastRotation > securityConfig.apiKeyRotationInterval;
}

/**
 * Rotates API keys for all users.
 * @returns {Promise<void>}
 */
async function rotateApiKeys() {
    if (!securityConfig.enableApiKeyRotation) return;
    
    console.log('Starting API key rotation...');
    
    let currentUsersConfig;
    try {
        const data = await readFileAsync(USERS_CONFIG_FILE, 'utf8');
        currentUsersConfig = JSON.parse(data);
    } catch (e) {
        console.error('Failed to load users config for key rotation:', e);
        return;
    }
    
    const usersDict = currentUsersConfig.users;
    let rotationCount = 0;
    
    for (const [oldKey, userData] of Object.entries(usersDict)) {
        if (needsApiKeyRotation(userData)) {
            const newKey = generateApiKey();
            
            // Move user data to new key
            usersDict[newKey] = { ...userData };
            delete usersDict[oldKey];
            
            // Update rotation timestamp
            usersDict[newKey].last_rotation_timestamp = Date.now();
            usersDict[newKey].last_updated_timestamp = Date.now();
            
            rotationCount++;
            console.log(`Rotated key for user: ${userData.username || 'Unknown'} (${oldKey.slice(0, 8)}... -> ${newKey.slice(0, 8)}...)`);
        }
    }
    
    if (rotationCount > 0) {
        await saveUsersConfig(currentUsersConfig);
        usersConfig = currentUsersConfig;
        console.log(`API key rotation completed. ${rotationCount} keys rotated.`);
    } else {
        console.log('No API keys needed rotation.');
    }
}

/**
 * Enhanced authentication middleware that uses the enhanced-auth module.
 * Checks for API key validity, enabled status, and daily token limits.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 */
async function authenticateRequest(req, res, next) {
    // The enhanced authentication is already applied globally
    // This function is kept for backward compatibility
    next();
}




/**
 * GET /admin/keys
 * Retrieves the current user/key configurations. Requires ADMIN_API_KEY.
 */
app.get('/admin/keys', asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    let providedApiKey = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        providedApiKey = authHeader.split(' ')[1];
    }

    if (providedApiKey !== ADMIN_API_KEY) {
        throw new SecurityError('Forbidden: Invalid admin API key.', 403);
    }

    await loadConfigurations();
    const currentUsersData = usersConfig.users;

    res.status(200).json({ users: currentUsersData });
}));



/**
 * GET /v1/models
 * Returns a list of available models based on the loaded provider configuration.
 * Conforms to the OpenAI API spec for listing models.
 */
app.get('/v1/models', asyncHandler(async (req, res) => {
    res.status(200).json({ object: 'list', data: availableModelsList });
}));

/**
 * GET /v1/usage
 * Returns aggregate token usage statistics (total and daily).
 */
app.get('/v1/usage', asyncHandler(async (req, res) => {
    let totalTokensProcessed = 0;
    let dailyTokensProcessed = 0;
    const currentUsersData = usersConfig.users;

    for (const userKey in currentUsersData) {
        const userData = currentUsersData[userKey];
        const userTotal = userData.total_tokens || 0;
        if (typeof userTotal === 'number') {
            totalTokensProcessed += userTotal;
        } else {
        }

        const lastUsage = userData.last_usage_timestamp;
        if (lastUsage && !isNewDay(lastUsage)) {
            const userDaily = userData.daily_tokens_used || 0;
            if (typeof userDaily === 'number') {
                dailyTokensProcessed += userDaily;
            } else {
            }
        }
    }

    const usageData = {
        total_tokens_processed: totalTokensProcessed,
        daily_tokens_processed_today_utc: dailyTokensProcessed,
        timestamp_utc: new Date().toISOString()
    };
    res.status(200).json(usageData);
}));

/**
 * POST /v1/*
 * Handles API requests to proxied provider endpoints (e.g., /v1/chat/completions).
 * Authenticates the request, selects a provider based on priority, and forwards the request.
 * Handles both streaming (SSE) and non-streaming responses.
 * Updates user token counts after successful requests.
 */
app.post('/v1/*', authenticateRequest, asyncHandler(async (req, res) => {
    try {
        // Log authentication attempt
        await securityAuditLogger.logAuthenticationEvent('api_request', {
            endpoint: req.path,
            method: req.method
        }, req);

        // Validate request body size
        securityValidator.validateRequestBodySize(req.body);

        if (!providersConfig || !providersConfig.endpoints) {
            throw new ConfigurationError('Provider configuration is missing or invalid.');
        }

        const endpointConfig = providersConfig.endpoints[req.path];
        if (!endpointConfig || !endpointConfig.models) {
            throw new ConfigurationError(`Configuration missing for endpoint: ${req.path}`);
        }

        const requestedModel = req.body.model;
        if (!requestedModel) {
            throw new ValidationError("Missing 'model' field in request body.");
        }

        // Validate model name
        securityValidator.validateModelName(requestedModel);

        // Validate prompt content if present
        if (req.body.messages && Array.isArray(req.body.messages)) {
            for (const message of req.body.messages) {
                if (message.content && typeof message.content === 'string') {
                    securityValidator.validatePrompt(message.content);
                }
            }
        }

    let estimatedInputContentTokens = 0;
    try {
        if (req.body.messages && Array.isArray(req.body.messages)) {
            let totalInputContentLength = 0;
            for (const message of req.body.messages) {
                if (typeof message === 'object' && message !== null && typeof message.content === 'string') {
                    totalInputContentLength += message.content.length;
                }
            }
            estimatedInputContentTokens = Math.ceil(totalInputContentLength / 4);
        } else {
        }
    } catch (e) {
    }

    const providers = endpointConfig.models[requestedModel];
    if (!providers) {
        return res.status(404).json({
            error: {
                code: "model_not_found",
                message: `The model \`${requestedModel}\` does not exist or you do not have access to it.`,
                param: null,
                type: "invalid_request_error"
            }
        });
    }

    // Filter providers based on user plan and model availability
    let filteredProviders = providers;
    
    // Check if user has a free plan
    const userPlan = req.authenticatedApiKey ? usersConfig.users[req.authenticatedApiKey].plan : null;
    const isFreePlan = userPlan && (userPlan === "0" || userPlan === "500k");
    
    if (isFreePlan) {
        // Filter out non-free models for free plan users
        filteredProviders = providers.filter(provider => {
            // Check if model is marked as free
            if (provider.metadata && provider.metadata.raw) {
                // Check is_free flag first
                if (typeof provider.metadata.raw.is_free === 'boolean') {
                    return provider.metadata.raw.is_free;
                }
                // Check premium_model flag
                if (typeof provider.metadata.raw.premium_model === 'boolean') {
                    return !provider.metadata.raw.premium_model;
                }
                // Check tier (models with tier 'seed' are typically free)
                if (typeof provider.metadata.raw.tier === 'string') {
                    return provider.metadata.raw.tier === 'seed';
                }
            }
            // If no clear indication, assume it's a paid model and filter it out for free users
            return false;
        });
        
        // If no providers left after filtering, return an error
        if (filteredProviders.length === 0) {
            return res.status(403).json({
                error: {
                    code: "model_not_available",
                    message: `The model \`${requestedModel}\` is not available for free users. Please upgrade your plan to access this model.`,
                    param: null,
                    type: "forbidden_error"
                }
            });
        }
    }

    // Sort providers by priority and cost (lower cost first for free models, then priority)
    const sortedProviders = filteredProviders.sort((a, b) => {
      // First, check if one is free and the other is not
      const aIsFree = a.metadata?.is_free || false;
      const bIsFree = b.metadata?.is_free || false;
      
      if (aIsFree && !bIsFree) return -1; // Free models come first
      if (!aIsFree && bIsFree) return 1;  // Non-free models come later
      
      // If both are free or both are paid, sort by priority
      const aPriority = a.priority || 99;
      const bPriority = b.priority || 99;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // If priorities are the same, sort by cost (lower cost first)
      const aCost = a.metadata?.cost_per_token || 999999;
      const bCost = b.metadata?.cost_per_token || 999999;
      
      return aCost - bCost;
    });

    let lastError = null;
    let lastErrorBody = null;
    let fallbackAttempts = 0;
    const maxFallbackAttempts = 3; // Maximum number of fallback attempts

    for (const provider of sortedProviders) {
        const providerName = provider.provider_name || 'Unknown';
        const baseUrl = provider.base_url;
        const apiKey = provider.api_key;
        const model = provider.model;

        if (!baseUrl || !apiKey) {
            lastError = `Configuration error for provider ${providerName}`;
            continue;
        }

        const targetUrl = baseUrl.includes("/api/openai") ? 
            `${baseUrl.replace(/\/+$/, '')}${req.path.replace(/^\/v1\//, '')}` : 
            `${baseUrl.replace(/\/+$/, '')}${req.path}`;

        const newRequestBody = { ...req.body, model: model };
        const requestBodyBuffer = Buffer.from(JSON.stringify(newRequestBody), 'utf-8');

        try {
            const fetch = await import('node-fetch');
            const headers = {
                'Content-Type': req.headers['content-type'] || 'application/json',
                'User-Agent': 'curl/7.68.0',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
            };

            if (!baseUrl.includes("/api/openai")) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            } else {
            }

            const proxyResponse = await fetch.default(targetUrl, {
                method: 'POST',
                headers: headers,
                body: requestBodyBuffer,
                timeout: 120000
            });


            const responseStatus = proxyResponse.status;
            const contentType = proxyResponse.headers.get('Content-Type') || '';
            const isStreaming = contentType.includes('text/event-stream');

            let responseBodyBuffer;
            let tokensUsed = 0;
            let explicitTokensFound = false;

            if (isStreaming) {
                res.status(responseStatus);
                for (const [key, value] of proxyResponse.headers.entries()) {
                    if (!['transfer-encoding', 'connection', 'content-encoding', 'content-length', 'access-control-allow-origin'].includes(key.toLowerCase())) {
                        res.setHeader(key, value);
                    }
                }
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Accel-Buffering', 'no');

                proxyResponse.body.pipe(res);

                let streamedContentLength = 0;
                let buffer = '';
                for await (const chunk of proxyResponse.body) {
                    buffer += chunk.toString('utf8');
                    responseBodyBuffer = chunk;

                    while (buffer.includes('\n\n')) {
                        const eventBlock = buffer.substring(0, buffer.indexOf('\n\n') + 2);
                        buffer = buffer.substring(buffer.indexOf('\n\n') + 2);

                        const linesInBlock = eventBlock.split('\n');
                        for (const line of linesInBlock) {
                            if (line.startsWith('data:')) {
                                const dataStr = line.substring('data:'.length).trim();
                                if (dataStr && dataStr !== '[DONE]') {
                                    try {
                                        const eventData = JSON.parse(dataStr);
                                        if (eventData && eventData.choices && Array.isArray(eventData.choices)) {
                                            for (const choice of eventData.choices) {
                                                if (choice && choice.delta && typeof choice.delta.content === 'string') {
                                                    streamedContentLength += choice.delta.content.length;
                                                }
                                            }
                                        }
                                    } catch (parseError) {
                                    }
                                }
                            }
                        }
                    }
                }
                if (buffer) {
                    const linesInBlock = buffer.split('\n');
                    for (const line of linesInBlock) {
                        if (line.startsWith('data:')) {
                            const dataStr = line.substring('data:'.length).trim();
                            if (dataStr && dataStr !== '[DONE]') {
                                try {
                                    const eventData = JSON.parse(dataStr);
                                    if (eventData && eventData.choices && Array.isArray(eventData.choices)) {
                                        for (const choice of eventData.choices) {
                                            if (choice && choice.delta && typeof choice.delta.content === 'string') {
                                                streamedContentLength += choice.delta.content.length;
                                            }
                                        }
                                    }
                                } catch (parseError) {
                                }
                            }
                        }
                    }
                }


                tokensUsed = Math.ceil(streamedContentLength / 4);
                explicitTokensFound = false;
                responseBodyBuffer = Buffer.from(buffer);
            } else {
                responseBodyBuffer = await proxyResponse.buffer();

                res.status(responseStatus);
                for (const [key, value] of proxyResponse.headers.entries()) {
                    if (key.toLowerCase() === 'content-length') {
                        res.setHeader('Content-Length', responseBodyBuffer.length);
                    } else if (!['transfer-encoding', 'connection', 'access-control-allow-origin'].includes(key.toLowerCase())) {
                        res.setHeader(key, value);
                    }
                }
                if (!proxyResponse.headers.has('content-length')) {
                    res.setHeader('Content-Length', responseBodyBuffer.length);
                }

                res.send(responseBodyBuffer);

                const isImageGenerationRequest = (req.path === '/v1/images/generations');
                if (isImageGenerationRequest && responseStatus < 400) {
                    tokensUsed = 1;
                    explicitTokensFound = true;
                } else {
                    const trimmedBody = responseBodyBuffer.toString().trim();
                    const isPotentialJson = (trimmedBody.startsWith('{') && trimmedBody.endsWith('}')) ||
                                            (trimmedBody.startsWith('[') && trimmedBody.endsWith(']'));

                    if (isPotentialJson) {
                        try {
                            const responseJson = JSON.parse(trimmedBody);
                            if (responseJson && responseJson.usage && typeof responseJson.usage === 'object') {
                                if (typeof responseJson.usage.total_tokens === 'number' && responseJson.usage.total_tokens > 0) {
                                    tokensUsed = responseJson.usage.total_tokens;
                                    explicitTokensFound = true;
                                } else if (typeof responseJson.usage.prompt_tokens === 'number' && typeof responseJson.usage.completion_tokens === 'number' && (responseJson.usage.prompt_tokens > 0 || responseJson.usage.completion_tokens > 0)) {
                                    tokensUsed = responseJson.usage.prompt_tokens + responseJson.usage.completion_tokens;
                                    explicitTokensFound = true;
                                } else {
                                }
                            } else {
                            }
                        } catch (parseError) {
                        }
                    }

                    if (!explicitTokensFound) {
                        const estimatedOutputBodyTokens = Math.ceil(responseBodyBuffer.length / 4);
                        const inputTokensEstimate = estimatedInputContentTokens;
                        const totalEstimatedTokens = inputTokensEstimate + estimatedOutputBodyTokens;
                        tokensUsed = totalEstimatedTokens;
                    }
                }
            }

            if (typeof tokensUsed === 'number' && tokensUsed > 0) {
                if (req.authenticatedApiKey) {
                    const logPrefix = explicitTokensFound ? "explicit" : "estimated fallback";
                    const providerMultiplier = provider.token_multiplier || 1.0;
                    await updateUserTokenCount(req.authenticatedApiKey, tokensUsed, providerMultiplier);
                } else {
                }
            } else if (explicitTokensFound) {
            } else {
            }

            return;
        } catch (e) {
            // Check if this is a provider denial or rate limit error
            let isProviderDenial = false;
            let isRateLimit = false;
            
            if (e.response && e.response.status) {
                const status = e.response.status;
                // Check for access denied errors (403)
                if (status === 403) {
                    isProviderDenial = true;
                    lastError = `Access denied by provider ${providerName}: ${e.message}`;
                }
                // Check for rate limit errors (429)
                else if (status === 429) {
                    isRateLimit = true;
                    lastError = `Rate limit exceeded for provider ${providerName}: ${e.message}`;
                }
                // Check for daily token limit errors
                else if (status === 402 && e.message && e.message.includes('token')) {
                    isRateLimit = true;
                    lastError = `Daily token limit reached for provider ${providerName}: ${e.message}`;
                }
            } else if (e.name === 'AbortError' || e.name === 'FetchError') {
                lastError = `Network error contacting provider ${providerName}: ${e.message}`;
                if (e.response && e.response.body) {
                    try {
                        lastErrorBody = await e.response.json();
                    } catch {
                        lastErrorBody = await e.response.text();
                    }
                }
            } else {
                lastError = `Unexpected error with provider ${providerName}: ${e.message}`;
            }
            
            // If this was a provider denial or rate limit, try the next provider
            if (isProviderDenial || isRateLimit) {
                fallbackAttempts++;
                if (fallbackAttempts < maxFallbackAttempts && sortedProviders.length > 1) {
                    continue; // Try the next provider
                }
            }
        }
    }

    const responsePayload = {
        error: "All upstream providers failed",
        details: lastError || "Unknown error"
    };
    if (lastErrorBody) {
        responsePayload.last_provider_error_body = lastErrorBody;
    }
    res.status(502).json(responsePayload);
    } catch (error) {
        // Log error
        await securityAuditLogger.logError('api_request', error, req.authenticatedApiKey, req);
        throw error;
    }
}));

app.post('/v1/images/generations', authenticateRequest, asyncHandler(async (req, res) => {
    try {
        // Log authentication attempt
        await securityAuditLogger.logAuthenticationEvent('api_request', {
            endpoint: req.path,
            method: req.method
        }, req);

        // Validate request body size
        securityValidator.validateRequestBodySize(req.body);

        if (!providersConfig || !providersConfig.endpoints) {
            throw new ConfigurationError('Provider configuration is missing or invalid.');
        }

        const endpointConfig = providersConfig.endpoints[req.path];
        if (!endpointConfig || !endpointConfig.models) {
            throw new ConfigurationError(`Configuration missing for endpoint: ${req.path}`);
        }

        const requestedModel = req.body.model;
        if (!requestedModel) {
            throw new ValidationError("Missing 'model' field in request body.");
        }

        // Validate model name
        securityValidator.validateModelName(requestedModel);

        // Validate prompt content if present
        if (req.body.prompt && typeof req.body.prompt === 'string') {
            securityValidator.validatePrompt(req.body.prompt);
        }

    const providers = endpointConfig.models[requestedModel];
    if (!providers) {
        return res.status(404).json({
            error: {
                code: "model_not_found",
                message: `The model \`${requestedModel}\` does not exist or you do not have access to it.`,
                param: null,
                type: "invalid_request_error"
            }
        });
    }

    // Filter providers based on user plan and model availability
    let filteredProviders = providers;
    
    // Check if user has a free plan
    const userPlan = req.authenticatedApiKey ? usersConfig.users[req.authenticatedApiKey].plan : null;
    const isFreePlan = userPlan && (userPlan === "0" || userPlan === "500k");
    
    if (isFreePlan) {
        // Filter out non-free models for free plan users
        filteredProviders = providers.filter(provider => {
            // Check if model is marked as free
            if (provider.metadata && provider.metadata.raw) {
                // Check is_free flag first
                if (typeof provider.metadata.raw.is_free === 'boolean') {
                    return provider.metadata.raw.is_free;
                }
                // Check premium_model flag
                if (typeof provider.metadata.raw.premium_model === 'boolean') {
                    return !provider.metadata.raw.premium_model;
                }
                // Check tier (models with tier 'seed' are typically free)
                if (typeof provider.metadata.raw.tier === 'string') {
                    return provider.metadata.raw.tier === 'seed';
                }
            }
            // If no clear indication, assume it's a paid model and filter it out for free users
            return false;
        });
        
        // If no providers left after filtering, return an error
        if (filteredProviders.length === 0) {
            return res.status(403).json({
                error: {
                    code: "model_not_available",
                    message: `The model \`${requestedModel}\` is not available for free users. Please upgrade your plan to access this model.`,
                    param: null,
                    type: "forbidden_error"
                }
            });
        }
    }

    // Sort providers by priority and cost (lower cost first for free models, then priority)
    const sortedProviders = filteredProviders.sort((a, b) => {
      // First, check if one is free and the other is not
      const aIsFree = a.metadata?.is_free || false;
      const bIsFree = b.metadata?.is_free || false;
      
      if (aIsFree && !bIsFree) return -1; // Free models come first
      if (!aIsFree && bIsFree) return 1;  // Non-free models come later
      
      // If both are free or both are paid, sort by priority
      const aPriority = a.priority || 99;
      const bPriority = b.priority || 99;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // If priorities are the same, sort by cost (lower cost first)
      const aCost = a.metadata?.cost_per_token || 999999;
      const bCost = b.metadata?.cost_per_token || 999999;
      
      return aCost - bCost;
    });

    let lastError = null;
    let lastErrorBody = null;

    for (const provider of sortedProviders) {
        const providerName = provider.provider_name || 'Unknown';
        const baseUrl = provider.base_url;
        const apiKey = provider.api_key;
        const model = provider.model;

        if (!baseUrl || !apiKey) {
            lastError = `Configuration error for provider ${providerName}`;
            continue;
        }

        const targetUrl = baseUrl.includes("/api/openai") ? 
            `${baseUrl.replace(/\/+$/, '')}${req.path.replace(/^\/v1\//, '')}` : 
            `${baseUrl.replace(/\/+$/, '')}${req.path}`;

        const newRequestBody = { ...req.body, model: model };
        const requestBodyBuffer = Buffer.from(JSON.stringify(newRequestBody), 'utf-8');

        try {
            const fetch = await import('node-fetch');
            const headers = {
                'Content-Type': req.headers['content-type'] || 'application/json',
                'User-Agent': 'curl/7.68.0',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
            };

            if (!baseUrl.includes("/api/openai")) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const proxyResponse = await fetch.default(targetUrl, {
                method: 'POST',
                headers: headers,
                body: requestBodyBuffer,
                timeout: 120000
            });


            const responseStatus = proxyResponse.status;
            const responseBodyBuffer = await proxyResponse.buffer();

            res.status(responseStatus);
            for (const [key, value] of proxyResponse.headers.entries()) {
                if (key.toLowerCase() === 'content-length') {
                    res.setHeader('Content-Length', responseBodyBuffer.length);
                } else if (!['transfer-encoding', 'connection', 'access-control-allow-origin'].includes(key.toLowerCase())) {
                    res.setHeader(key, value);
                }
            }
            if (!proxyResponse.headers.has('content-length')) {
                res.setHeader('Content-Length', responseBodyBuffer.length);
            }

            res.send(responseBodyBuffer);

            let tokensUsed = 1;
            let explicitTokensFound = true;

            if (typeof tokensUsed === 'number' && tokensUsed > 0) {
                if (req.authenticatedApiKey) {
                    const logPrefix = explicitTokensFound ? "explicit" : "estimated fallback";
                    const providerMultiplier = provider.token_multiplier || 1.0;
                    await updateUserTokenCount(req.authenticatedApiKey, tokensUsed, providerMultiplier);
                }
            }

            return;
        } catch (e) {
            if (e.name === 'AbortError' || e.name === 'FetchError') {
                lastError = `Network error contacting provider ${providerName}: ${e.message}`;
                if (e.response && e.response.body) {
                    try {
                        lastErrorBody = await e.response.json();
                    } catch {
                        lastErrorBody = await e.response.text();
                    }
                }
            } else {
                lastError = `Unexpected error with provider ${providerName}: ${e.message}`;
            }
        }
    }

    const responsePayload = {
        error: "All upstream providers failed",
        details: lastError || "Unknown error"
    };
    if (lastErrorBody) {
        responsePayload.last_provider_error_body = lastErrorBody;
    }
    res.status(502).json(responsePayload);
    } catch (error) {
        // Log error
        await securityAuditLogger.logError('api_request', error, req.authenticatedApiKey, req);
        throw error;
    }
}));

app.post('/v1/audio/transcriptions', authenticateRequest, upload.single('file'), asyncHandler(async (req, res) => {
    try {
        // Log authentication attempt
        await securityAuditLogger.logAuthenticationEvent('api_request', {
            endpoint: req.path,
            method: req.method
        }, req);

        // Validate request body size
        securityValidator.validateRequestBodySize(req.body);

        if (!req.file) {
            throw new ValidationError("Missing file for transcription.");
        }

        // Validate file upload
        securityValidator.validateFile(req.file, {
            maxSize: 25 * 1024 * 1024, // 25MB
            allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav'],
            allowedExtensions: ['mp3', 'wav', 'm4a']
        });

        if (!providersConfig || !providersConfig.endpoints) {
            throw new ConfigurationError('Provider configuration is missing or invalid.');
        }

        const endpointConfig = providersConfig.endpoints[req.path];
        if (!endpointConfig || !endpointConfig.models) {
            throw new ConfigurationError(`Configuration missing for endpoint: ${req.path}`);
        }

        const requestedModel = req.body.model;
        if (!requestedModel) {
            throw new ValidationError("Missing 'model' field in request body.");
        }

        // Validate model name
        securityValidator.validateModelName(requestedModel);

    const providers = endpointConfig.models[requestedModel];
    if (!providers) {
        return res.status(404).json({
            error: {
                code: "model_not_found",
                message: `The model \`${requestedModel}\` does not exist or you do not have access to it.`,
                param: null,
                type: "invalid_request_error"
            }
        });
    }

    // Filter providers based on user plan and model availability
    let filteredProviders = providers;
    
    // Check if user has a free plan
    const userPlan = req.authenticatedApiKey ? usersConfig.users[req.authenticatedApiKey].plan : null;
    const isFreePlan = userPlan && (userPlan === "0" || userPlan === "500k");
    
    if (isFreePlan) {
        // Filter out non-free models for free plan users
        filteredProviders = providers.filter(provider => {
            // Check if model is marked as free
            if (provider.metadata && provider.metadata.raw) {
                // Check is_free flag first
                if (typeof provider.metadata.raw.is_free === 'boolean') {
                    return provider.metadata.raw.is_free;
                }
                // Check premium_model flag
                if (typeof provider.metadata.raw.premium_model === 'boolean') {
                    return !provider.metadata.raw.premium_model;
                }
                // Check tier (models with tier 'seed' are typically free)
                if (typeof provider.metadata.raw.tier === 'string') {
                    return provider.metadata.raw.tier === 'seed';
                }
            }
            // If no clear indication, assume it's a paid model and filter it out for free users
            return false;
        });
        
        // If no providers left after filtering, return an error
        if (filteredProviders.length === 0) {
            return res.status(403).json({
                error: {
                    code: "model_not_available",
                    message: `The model \`${requestedModel}\` is not available for free users. Please upgrade your plan to access this model.`,
                    param: null,
                    type: "forbidden_error"
                }
            });
        }
    }

    // Sort providers by priority and cost (lower cost first for free models, then priority)
    const sortedProviders = filteredProviders.sort((a, b) => {
      // First, check if one is free and the other is not
      const aIsFree = a.metadata?.is_free || false;
      const bIsFree = b.metadata?.is_free || false;
      
      if (aIsFree && !bIsFree) return -1; // Free models come first
      if (!aIsFree && bIsFree) return 1;  // Non-free models come later
      
      // If both are free or both are paid, sort by priority
      const aPriority = a.priority || 99;
      const bPriority = b.priority || 99;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // If priorities are the same, sort by cost (lower cost first)
      const aCost = a.metadata?.cost_per_token || 999999;
      const bCost = b.metadata?.cost_per_token || 999999;
      
      return aCost - bCost;
    });

    let lastError = null;
    let lastErrorBody = null;

    for (const provider of sortedProviders) {
        const providerName = provider.provider_name || 'Unknown';
        const baseUrl = provider.base_url;
        const apiKey = provider.api_key;
        const model = provider.model;

        if (!baseUrl || !apiKey) {
            lastError = `Configuration error for provider ${providerName}`;
            continue;
        }

        const targetUrl = baseUrl.includes("/api/openai") ? 
            `${baseUrl.replace(/\/+$/, '')}${req.path.replace(/^\/v1\//, '')}` : 
            `${baseUrl.replace(/\/+$/, '')}${req.path}`;
        
        const formData = new FormData();
        formData.append('file', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
        formData.append('model', model);
        if (req.body.language) formData.append('language', req.body.language);
        if (req.body.prompt) formData.append('prompt', req.body.prompt);
        if (req.body.response_format) formData.append('response_format', req.body.response_format);
        if (req.body.temperature) formData.append('temperature', req.body.temperature);


        try {
            const fetch = await import('node-fetch');
            const headers = {
                ...formData.getHeaders(),
                'User-Agent': 'curl/7.68.0',
                'Accept': '*/*',
                'Connection': 'keep-alive',
            };

            if (!baseUrl.includes("/api/openai")) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const proxyResponse = await fetch.default(targetUrl, {
                method: 'POST',
                headers: headers,
                body: formData,
                timeout: 120000
            });

            const responseStatus = proxyResponse.status;
            const responseBodyBuffer = await proxyResponse.buffer();

            res.status(responseStatus);
            for (const [key, value] of proxyResponse.headers.entries()) {
                if (key.toLowerCase() === 'content-length') {
                    res.setHeader('Content-Length', responseBodyBuffer.length);
                } else if (!['transfer-encoding', 'connection', 'access-control-allow-origin'].includes(key.toLowerCase())) {
                    res.setHeader(key, value);
                }
            }
            if (!proxyResponse.headers.has('content-length')) {
                res.setHeader('Content-Length', responseBodyBuffer.length);
            }

            res.send(responseBodyBuffer);

            let tokensUsed = 0;
            let explicitTokensFound = false;

            try {
                const responseJson = JSON.parse(responseBodyBuffer.toString());
                if (responseJson.text) {
                    tokensUsed = Math.ceil(responseJson.text.length / 4);
                } else {
                    tokensUsed = 1;
                    explicitTokensFound = true;
                }
            } catch(e) {
                tokensUsed = 1;
                explicitTokensFound = true;
            }


            if (typeof tokensUsed === 'number' && tokensUsed > 0) {
                if (req.authenticatedApiKey) {
                    const logPrefix = explicitTokensFound ? "explicit" : "estimated fallback";
                    const providerMultiplier = provider.token_multiplier || 1.0;
                    await updateUserTokenCount(req.authenticatedApiKey, tokensUsed, providerMultiplier);
                }
            }

            return;
        } catch (e) {
            if (e.name === 'AbortError' || e.name === 'FetchError') {
                lastError = `Network error contacting provider ${providerName}: ${e.message}`;
                if (e.response && e.response.body) {
                    try {
                        lastErrorBody = await e.response.json();
                    } catch {
                        lastErrorBody = await e.response.text();
                    }
                }
            } else {
                lastError = `Unexpected error with provider ${providerName}: ${e.message}`;
            }
        }
    }

    const responsePayload = {
        error: "All upstream providers failed",
        details: lastError || "Unknown error"
    };
    if (lastErrorBody) {
        responsePayload.last_provider_error_body = lastErrorBody;
    }
    res.status(502).json(responsePayload);
    } catch (error) {
        // Log error
        await securityAuditLogger.logError('api_request', error, req.authenticatedApiKey, req);
        throw error;
    }
}));

app.post('/v1/audio/speech', authenticateRequest, asyncHandler(async (req, res) => {
    try {
        // Log authentication attempt
        await securityAuditLogger.logAuthenticationEvent('api_request', {
            endpoint: req.path,
            method: req.method
        }, req);

        // Validate request body size
        securityValidator.validateRequestBodySize(req.body);

        if (!providersConfig || !providersConfig.endpoints) {
            throw new ConfigurationError('Provider configuration is missing or invalid.');
        }

        const endpointConfig = providersConfig.endpoints[req.path];
        if (!endpointConfig || !endpointConfig.models) {
            throw new ConfigurationError(`Configuration missing for endpoint: ${req.path}`);
        }

        const requestedModel = req.body.model;
        if (!requestedModel) {
            throw new ValidationError("Missing 'model' field in request body.");
        }

        // Validate model name
        securityValidator.validateModelName(requestedModel);

        // Validate input text if present
        if (req.body.input && typeof req.body.input === 'string') {
            securityValidator.validatePrompt(req.body.input);
        }

    const providers = endpointConfig.models[requestedModel];
    if (!providers) {
        return res.status(404).json({
            error: {
                code: "model_not_found",
                message: `The model \`${requestedModel}\` does not exist or you do not access to it.`,
                param: null,
                type: "invalid_request_error"
            }
        });
    }

    // Filter providers based on user plan and model availability
    let filteredProviders = providers;
    
    // Check if user has a free plan
    const userPlan = req.authenticatedApiKey ? usersConfig.users[req.authenticatedApiKey].plan : null;
    const isFreePlan = userPlan && (userPlan === "0" || userPlan === "500k");
    
    if (isFreePlan) {
        // Filter out non-free models for free plan users
        filteredProviders = providers.filter(provider => {
            // Check if model is marked as free
            if (provider.metadata && provider.metadata.raw) {
                // Check is_free flag first
                if (typeof provider.metadata.raw.is_free === 'boolean') {
                    return provider.metadata.raw.is_free;
                }
                // Check premium_model flag
                if (typeof provider.metadata.raw.premium_model === 'boolean') {
                    return !provider.metadata.raw.premium_model;
                }
                // Check tier (models with tier 'seed' are typically free)
                if (typeof provider.metadata.raw.tier === 'string') {
                    return provider.metadata.raw.tier === 'seed';
                }
            }
            
            // Check cost information from the new rate_limit_cost_info field
            if (provider.metadata && provider.metadata.rate_limit_cost_info) {
                const costInfo = provider.metadata.rate_limit_cost_info;
                if (costInfo.is_free) {
                    return true;
                }
                // If cost is very low (like 0.001), consider it free for free plan users
                if (costInfo.cost_per_token && costInfo.cost_per_token <= 0.001) {
                    return true;
                }
            }
            
            // If no clear indication, assume it's a paid model and filter it out for free users
            return false;
        });
        
        // If no providers left after filtering, return an error
        if (filteredProviders.length === 0) {
            return res.status(403).json({
                error: {
                    code: "model_not_available",
                    message: `The model \`${requestedModel}\` is not available for free users. Please upgrade your plan to access this model.`,
                    param: null,
                    type: "forbidden_error"
                }
            });
        }
    }

    // Sort providers by priority and cost (lower cost first for free models, then priority)
    const sortedProviders = filteredProviders.sort((a, b) => {
      // First, check if one is free and the other is not
      const aIsFree = a.metadata?.is_free || false;
      const bIsFree = b.metadata?.is_free || false;
      
      if (aIsFree && !bIsFree) return -1; // Free models come first
      if (!aIsFree && bIsFree) return 1;  // Non-free models come later
      
      // If both are free or both are paid, sort by priority
      const aPriority = a.priority || 99;
      const bPriority = b.priority || 99;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // If priorities are the same, sort by cost (lower cost first)
      const aCost = a.metadata?.cost_per_token || 999999;
      const bCost = b.metadata?.cost_per_token || 999999;
      
      return aCost - bCost;
    });

    let lastError = null;
    let lastErrorBody = null;

    for (const provider of sortedProviders) {
        const providerName = provider.provider_name || 'Unknown';
        const baseUrl = provider.base_url;
        const apiKey = provider.api_key;
        const model = provider.model;

        if (!baseUrl || !apiKey) {
            lastError = `Configuration error for provider ${providerName}`;
            continue;
        }

        const targetUrl = baseUrl.includes("/api/openai") ? 
            `${baseUrl.replace(/\/+$/, '')}${req.path.replace(/^\/v1\//, '')}` : 
            `${baseUrl.replace(/\/+$/, '')}${req.path}`;

        const newRequestBody = { ...req.body, model: model };
        const requestBodyBuffer = Buffer.from(JSON.stringify(newRequestBody), 'utf-8');

        try {
            const fetch = await import('node-fetch');
            const headers = {
                'Content-Type': req.headers['content-type'] || 'application/json',
                'User-Agent': 'curl/7.68.0',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
            };

            if (!baseUrl.includes("/api/openai")) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const proxyResponse = await fetch.default(targetUrl, {
                method: 'POST',
                headers: headers,
                body: requestBodyBuffer,
                timeout: 120000
            });


            const responseStatus = proxyResponse.status;
            const responseBodyBuffer = await proxyResponse.buffer();

            res.status(responseStatus);
            for (const [key, value] of proxyResponse.headers.entries()) {
                if (key.toLowerCase() === 'content-length') {
                    res.setHeader('Content-Length', responseBodyBuffer.length);
                } else if (!['transfer-encoding', 'connection', 'access-control-allow-origin'].includes(key.toLowerCase())) {
                    res.setHeader(key, value);
                }
            }
            if (!proxyResponse.headers.has('content-length')) {
                res.setHeader('Content-Length', responseBodyBuffer.length);
            }

            res.send(responseBodyBuffer);

            let tokensUsed = 0;
            if (req.body.input && typeof req.body.input === 'string') {
                tokensUsed = req.body.input.length;
            } else {
                tokensUsed = 1;
            }
            
            let explicitTokensFound = true;

            if (typeof tokensUsed === 'number' && tokensUsed > 0) {
                if (req.authenticatedApiKey) {
                    const logPrefix = explicitTokensFound ? "explicit" : "estimated fallback";
                    const providerMultiplier = provider.token_multiplier || 1.0;
                    await updateUserTokenCount(req.authenticatedApiKey, tokensUsed, providerMultiplier);
                }
            }

            return;
        } catch (e) {
            if (e.name === 'AbortError' || e.name === 'FetchError') {
                lastError = `Network error contacting provider ${providerName}: ${e.message}`;
                if (e.response && e.response.body) {
                    try {
                        lastErrorBody = await e.response.json();
                    } catch {
                        lastErrorBody = await e.response.text();
                    }
                }
            } else {
                lastError = `Unexpected error with provider ${providerName}: ${e.message}`;
            }
        }
    }

    const responsePayload = {
        error: "All upstream providers failed",
        details: lastError || "Unknown error"
    };
    if (lastErrorBody) {
        responsePayload.last_provider_error_body = lastErrorBody;
    }
    res.status(502).json(responsePayload);
    } catch (error) {
        // Log error
        await securityAuditLogger.logError('api_request', error, req.authenticatedApiKey, req);
        throw error;
    }
}));

app.post('/v1/responses', authenticateRequest, asyncHandler(async (req, res) => {
    try {
        // Log authentication attempt
        await securityAuditLogger.logAuthenticationEvent('api_request', {
            endpoint: req.path,
            method: req.method
        }, req);

        // Validate request body size
        securityValidator.validateRequestBodySize(req.body);

        if (!providersConfig || !providersConfig.endpoints) {
            throw new ConfigurationError('Provider configuration is missing or invalid.');
        }

        const endpointConfig = providersConfig.endpoints[req.path];
        if (!endpointConfig || !endpointConfig.models) {
            throw new ConfigurationError(`Configuration missing for endpoint: ${req.path}`);
        }

        const requestedModel = req.body.model;
        if (!requestedModel) {
            throw new ValidationError("Missing 'model' field in request body.");
        }

        // Validate model name
        securityValidator.validateModelName(requestedModel);

        // Validate input if present
        if (req.body.input && typeof req.body.input === 'string') {
            securityValidator.validatePrompt(req.body.input);
        }
    
    if (!req.body.input) {
        throw new ValidationError("Missing 'input' field in request body for /v1/responses endpoint.");
    }

    const providers = endpointConfig.models[requestedModel];
    if (!providers) {
        return res.status(404).json({
            error: {
                code: "model_not_found",
                message: `The model \`${requestedModel}\` does not exist or you do not have access to it.`,
                param: null,
                type: "invalid_request_error"
            }
        });
    }

    // Filter providers based on user plan and model availability
    let filteredProviders = providers;
    
    // Check if user has a free plan
    const userPlan = req.authenticatedApiKey ? usersConfig.users[req.authenticatedApiKey].plan : null;
    const isFreePlan = userPlan && (userPlan === "0" || userPlan === "500k");
    
    if (isFreePlan) {
        // Filter out non-free models for free plan users
        filteredProviders = providers.filter(provider => {
            // Check if model is marked as free
            if (provider.metadata && provider.metadata.raw) {
                // Check is_free flag first
                if (typeof provider.metadata.raw.is_free === 'boolean') {
                    return provider.metadata.raw.is_free;
                }
                // Check premium_model flag
                if (typeof provider.metadata.raw.premium_model === 'boolean') {
                    return !provider.metadata.raw.premium_model;
                }
                // Check tier (models with tier 'seed' are typically free)
                if (typeof provider.metadata.raw.tier === 'string') {
                    return provider.metadata.raw.tier === 'seed';
                }
            }
            
            // Check cost information from the new rate_limit_cost_info field
            if (provider.metadata && provider.metadata.rate_limit_cost_info) {
                const costInfo = provider.metadata.rate_limit_cost_info;
                if (costInfo.is_free) {
                    return true;
                }
                // If cost is very low (like 0.001), consider it free for free plan users
                if (costInfo.cost_per_token && costInfo.cost_per_token <= 0.001) {
                    return true;
                }
            }
            
            // If no clear indication, assume it's a paid model and filter it out for free users
            return false;
        });
        
        // If no providers left after filtering, return an error
        if (filteredProviders.length === 0) {
            return res.status(403).json({
                error: {
                    code: "model_not_available",
                    message: `The model \`${requestedModel}\` is not available for free users. Please upgrade your plan to access this model.`,
                    param: null,
                    type: "forbidden_error"
                }
            });
        }
    }

    // Sort providers by priority and cost (lower cost first for free models, then priority)
    const sortedProviders = filteredProviders.sort((a, b) => {
      // First, check if one is free and the other is not
      const aIsFree = a.metadata?.is_free || false;
      const bIsFree = b.metadata?.is_free || false;
      
      if (aIsFree && !bIsFree) return -1; // Free models come first
      if (!aIsFree && bIsFree) return 1;  // Non-free models come later
      
      // If both are free or both are paid, sort by priority
      const aPriority = a.priority || 99;
      const bPriority = b.priority || 99;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // If priorities are the same, sort by cost (lower cost first)
      const aCost = a.metadata?.cost_per_token || 999999;
      const bCost = b.metadata?.cost_per_token || 999999;
      
      return aCost - bCost;
    });

    let lastError = null;
    let lastErrorBody = null;

    for (const provider of sortedProviders) {
        const providerName = provider.provider_name || 'Unknown';
        const baseUrl = provider.base_url;
        const apiKey = provider.api_key;
        const model = provider.model;

        if (!baseUrl || !apiKey) {
            lastError = `Configuration error for provider ${providerName}`;
            continue;
        }

        const targetUrl = baseUrl.includes("/api/openai") ? 
            `${baseUrl.replace(/\/+$/, '')}${req.path.replace(/^\/v1\//, '')}` : 
            `${baseUrl.replace(/\/+$/, '')}${req.path}`;

        const newRequestBody = { ...req.body, model: model };
        const requestBodyBuffer = Buffer.from(JSON.stringify(newRequestBody), 'utf-8');

        try {
            const fetch = await import('node-fetch');
            const headers = {
                'Content-Type': req.headers['content-type'] || 'application/json',
                'User-Agent': 'curl/7.68.0',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
            };

            if (!baseUrl.includes("/api/openai")) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const proxyResponse = await fetch.default(targetUrl, {
                method: 'POST',
                headers: headers,
                body: requestBodyBuffer,
                timeout: 120000
            });


            const responseStatus = proxyResponse.status;
            const responseBodyBuffer = await proxyResponse.buffer();

            res.status(responseStatus);
            for (const [key, value] of proxyResponse.headers.entries()) {
                if (key.toLowerCase() === 'content-length') {
                    res.setHeader('Content-Length', responseBodyBuffer.length);
                } else if (!['transfer-encoding', 'connection', 'access-control-allow-origin'].includes(key.toLowerCase())) {
                    res.setHeader(key, value);
                }
            }
            if (!proxyResponse.headers.has('content-length')) {
                res.setHeader('Content-Length', responseBodyBuffer.length);
            }

            res.send(responseBodyBuffer);

            let tokensUsed = 0;
            let explicitTokensFound = false;

            try {
                const responseJson = JSON.parse(responseBodyBuffer.toString());
                if (responseJson.usage && responseJson.usage.total_tokens) {
                    tokensUsed = responseJson.usage.total_tokens;
                    explicitTokensFound = true;
                } else {
                    let outputText = "";
                    if (responseJson.output && Array.isArray(responseJson.output)) {
                        for (const item of responseJson.output) {
                            if (item.type === 'message' && item.content && Array.isArray(item.content)) {
                                for (const contentItem of item.content) {
                                    if (contentItem.type === 'output_text' && contentItem.text) {
                                        outputText += contentItem.text;
                                    }
                                }
                            }
                        }
                    } else if (responseJson.output_text) {
                        outputText = responseJson.output_text;
                    }
                    
                    const inputTokens = Math.ceil((req.body.input || "").length / 4);
                    const outputTokens = Math.ceil(outputText.length / 4);
                    tokensUsed = inputTokens + outputTokens;
                }
            } catch(e) {
                const inputTokens = Math.ceil((req.body.input || "").length / 4);
                const outputTokens = Math.ceil(responseBodyBuffer.length / 4);
                tokensUsed = inputTokens + outputTokens;
            }


            if (typeof tokensUsed === 'number' && tokensUsed > 0) {
                if (req.authenticatedApiKey) {
                    const logPrefix = explicitTokensFound ? "explicit" : "estimated fallback";
                    const providerMultiplier = provider.token_multiplier || 1.0;
                    await updateUserTokenCount(req.authenticatedApiKey, tokensUsed, providerMultiplier);
                }
            }

            return;
        } catch (e) {
            if (e.name === 'AbortError' || e.name === 'FetchError') {
                lastError = `Network error contacting provider ${providerName}: ${e.message}`;
                if (e.response && e.response.body) {
                    try {
                        lastErrorBody = await e.response.json();
                    } catch {
                        lastErrorBody = await e.response.text();
                    }
                }
            } else {
                lastError = `Unexpected error with provider ${providerName}: ${e.message}`;
            }
        }
    }

    const responsePayload = {
        error: "All upstream providers failed",
        details: lastError || "Unknown error"
    };
    if (lastErrorBody) {
        responsePayload.last_provider_error_body = lastErrorBody;
    }
    res.status(502).json(responsePayload);
    } catch (error) {
        // Log error
        await securityAuditLogger.logError('api_request', error, req.authenticatedApiKey, req);
        throw error;
    }
}));

/**
 * POST /admin/keys
 * Manages user API keys: add, enable, disable, change plan, reset key. Requires ADMIN_API_KEY.
 */
app.post('/admin/keys', asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    let providedApiKey = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        providedApiKey = authHeader.split(' ')[1];
    }

    if (providedApiKey !== ADMIN_API_KEY) {
        throw new SecurityError('Forbidden: Invalid admin API key.', 403);
    }

    const { action, api_key: targetApiKey, username, plan: newPlan, user_id } = req.body;

    if (!action || !targetApiKey) {
        throw new ValidationError("Missing 'action' or 'api_key' in ExoML Router admin request body.");
    }


    let currentUsersConfig;
    try {
        const data = await readFileAsync(USERS_CONFIG_FILE, 'utf8');
        currentUsersConfig = JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT') {
            currentUsersConfig = { users: {} };
        } else if (e instanceof SyntaxError) {
            currentUsersConfig = usersConfig;
        } else {
            currentUsersConfig = usersConfig;
        }
    }
    let usersDict = currentUsersConfig.users;
    let configChanged = false;
    const validPlans = ["0", "500k", "100m", "unlimited"];

    switch (action) {
        case 'add':
            if (!username) {
                throw new ValidationError("Missing 'username' for 'add' action.");
            }
            const planToAdd = newPlan || "0";
            if (!validPlans.includes(planToAdd)) {
                throw new ValidationError(`Invalid plan '${planToAdd}'. Valid plans: ${validPlans}`);
            }
            if (usersDict[targetApiKey]) {
                throw new ConflictError(`API key ...${targetApiKey.slice(-4)} already exists.`);
            }

            usersDict[targetApiKey] = {
                username: username,
                user_id: user_id,
                plan: planToAdd,
                enabled: true,
                total_tokens: 0,
                daily_tokens_used: 0,
                last_usage_timestamp: null,
                last_updated_timestamp: Math.floor(Date.now() / 1000)
            };
            configChanged = true;
            res.status(201).json({ message: `User '${username}' added successfully with key ${targetApiKey}.` });
            break;

        case 'enable':
        case 'disable':
            const user_data_status = usersDict[targetApiKey];
            if (!user_data_status) {
                throw new NotFoundError(`API key ...${targetApiKey.slice(-4)} not found.`);
            }
            const newStatus = (action === 'enable');
            if (user_data_status.enabled === newStatus) {
                res.status(200).json({ message: `API key ...${targetApiKey.slice(-4)} is already ${action}d.` });
                return;
            }
            user_data_status.enabled = newStatus;
            user_data_status.last_updated_timestamp = Math.floor(Date.now() / 1000);
            configChanged = true;
            res.status(200).json({ message: `API key ...${targetApiKey.slice(-4)} has been ${action}d.` });
            break;

        case 'change_plan':
            const user_data_plan = usersDict[targetApiKey];
            if (!user_data_plan) {
                throw new NotFoundError(`API key ...${targetApiKey.slice(-4)} not found.`);
            }
            if (!newPlan) {
                throw new ValidationError("Missing 'new_plan' parameter for 'change_plan' action.");
            }
            if (!validPlans.includes(newPlan)) {
                throw new ValidationError(`Invalid plan '${newPlan}'. Valid plans: ${validPlans}`);
            }
            const oldPlan = user_data_plan.plan || 'N/A';
            if (oldPlan === newPlan) {
                res.status(200).json({ message: `API key ...${targetApiKey.slice(-4)} already has plan '${newPlan}'.` });
                return;
            }
            user_data_plan.plan = newPlan;
            user_data_plan.last_updated_timestamp = Math.floor(Date.now() / 1000);
            configChanged = true;
            res.status(200).json({ message: `Plan for API key ...${targetApiKey.slice(-4)} changed from '${oldPlan}' to '${newPlan}'.` });
            break;

        case 'resetkey':
            const user_data_reset = usersDict[targetApiKey];
            if (!user_data_reset) {
                throw new NotFoundError(`API key ...${targetApiKey.slice(-4)} not found.`);
            }
            const crypto = require('crypto');
            let newKey = `sk-${crypto.randomBytes(24).toString('hex')}`;

            while (usersDict[newKey]) {
                newKey = `sk-${crypto.randomBytes(24).toString('hex')}`;
            }

            usersDict[newKey] = user_data_reset;
            delete usersDict[targetApiKey];
            configChanged = true;
            res.status(200).json({ message: `Key for user '${user_data_reset.username || 'Unknown'}' reset successfully.`, new_api_key: newKey });
            break;

        default:
            throw new ValidationError(`Invalid ExoML Router admin action: ${action}. Valid actions: add, enable, disable, change_plan, resetkey.`);
    }

    if (configChanged) {
        if (!(await saveUsersConfig(currentUsersConfig))) {
            throw new Error('Failed to save user configuration.');
        } else {
            usersConfig = currentUsersConfig;
        }
    }
}));



/**
 * GET /
 * Serves the main index.html page, injecting the total processed tokens.
 */
app.get('/', asyncHandler(async (req, res) => {
    let totalTokens = 0;
    if (usersConfig && usersConfig.users) {
        for (const userKey in usersConfig.users) {
            const userData = usersConfig.users[userKey];
            const userTokens = userData.total_tokens || 0;
            if (typeof userTokens === 'number') {
                totalTokens += userTokens;
            } else {
            }
        }
    }

    const formattedTotalTokens = totalTokens.toLocaleString();
    const indexPath = path.join(STATIC_DIRECTORY, 'index.html');
    let htmlContent;
    try {
        htmlContent = await readFileAsync(indexPath, 'utf8');
    } catch (e) {
        if (e.code === 'ENOENT') {
            throw new NotFoundError("File Not Found: index.html");
        }
        throw e;
    }

    const modifiedHtmlContent = htmlContent.replace('<!-- TOTAL_TOKENS -->', formattedTotalTokens);

    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8")
                   .setHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                   .setHeader("Pragma", "no-cache")
                   .setHeader("Expires", "0")
                   .send(modifiedHtmlContent);
}));

/**
 * GET /favicon.png
 * Serves the favicon.
 */
app.get('/favicon.png', (req, res) => {
    res.sendFile(path.join(STATIC_DIRECTORY, 'favicon.png'));
});

/**
 * GET /chat
 * Serves a chat interface page (chat.html). Creates a placeholder if the file doesn't exist.
 */
app.get('/chat', asyncHandler(async (req, res) => {
    const chatPagePath = path.join(STATIC_DIRECTORY, 'chat.html');
    let htmlContent;

    try {
        htmlContent = await readFileAsync(chatPagePath, 'utf8');
    } catch (e) {
        if (e.code === 'ENOENT') {
            const placeholderContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ExoML Router Chat - Coming Soon</title>
    <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f0f0; color: #333; }
        .container { text-align: center; padding: 20px; background-color: #fff; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        h1 { color: #007bff; }
    </style>
</head>
<body>
    <div class="container">
        <h1>ExoML Router Chat Feature Coming Soon!</h1>
        <p>We're working hard to bring you an amazing chat experience with ExoML Router.</p>
        <p>Please check back later.</p>
    </div>
</body>
</html>
`;
            await writeFileAsync(chatPagePath, placeholderContent);
            htmlContent = placeholderContent;
        } else {
            throw e;
        }
    }

    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8")
                   .setHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                   .setHeader("Pragma", "no-cache")
                   .setHeader("Expires", "0")
                   .send(htmlContent);
}));


/**
 * Catch-all GET route for unhandled paths.
 */
app.get('*', (req, res) => {
    res.status(404).send("Not Found");
});

/**
 * Catch-all POST route for unhandled paths.
 */
app.post('*', (req, res) => {
    res.status(404).send("Endpoint not found for POST.");
});

let server;
let watcher;
const chokidar = require('chokidar');

/**
 * Starts or restarts the Express server.
 * If an instance is already running, it's shut down before starting a new one.
 * This allows for reloading configurations without full process restart.
 */
async function startServer() {
    if (server) {
        server.close(() => {
            startNewServerInstance();
        });
    } else {
        startNewServerInstance();
    }
}

/**
 * Initializes and starts a new instance of the Express server.
 * Loads configurations, sets up file watching for `providers.json`, and starts listening.
 * Handles EADDRINUSE errors by retrying after a delay.
 */
async function startNewServerInstance() {
    await loadConfigurations();

    if (watcher) {
        watcher.close();
    }

    try {
        server = app.listen(PORT, HOST, () => {
            const actualHost = server.address().address;
            const actualPort = server.address().port;
            const displayHost = actualHost === '0.0.0.0' ? 'localhost' : actualHost;

            if (usersConfig && usersConfig.users && Object.keys(usersConfig.users).length > 0) {
            } else {
            }

            watcher = chokidar.watch(CONFIG_FILE, { persistent: true, ignoreInitial: true });
            watcher.on('change', async (filePath) => {
                await startServer();
            });
            watcher.on('error', error => { });
        });

        server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                setTimeout(() => {
                    startNewServerInstance();
                }, 5000);
            } else {
                process.exit(1);
            }
        });

    } catch (e) {
        process.exit(1);
    }
}

// Start API key rotation scheduler
if (securityConfig.enableApiKeyRotation) {
    const rotationIntervalMs = securityConfig.apiKeyRotationInterval;
    setInterval(rotateApiKeys, rotationIntervalMs);
    console.log(`API key rotation scheduled every ${rotationIntervalMs / 1000 / 60 / 60} hours`);
}

startServer();

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

process.on('SIGINT', () => {
    if (server) {
        server.close(() => {
            if (watcher) {
                watcher.close();
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});