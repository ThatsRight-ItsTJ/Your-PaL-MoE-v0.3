
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

const PORT = 2715;
const HOST = '0.0.0.0';
const CONFIG_FILE = 'providers.json';
const USERS_CONFIG_FILE = 'users.json';
const ADMIN_API_KEY = '';
const STATIC_DIRECTORY = __dirname;

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

    providersConfig = loadedProvidersConfig;
    usersConfig = loadedUsersConfig;
    availableModelsList = _generateModelsList(providersConfig);

    return { providersConfig, usersConfig };
}

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'X-Powered-By'],
    credentials: true,
    maxAge: 86400
}));

app.use(express.json({ limit: '10mb' }));

app.use(express.static(STATIC_DIRECTORY));


/**
 * Express middleware for authenticating requests based on API keys in `users.json`.
 * Checks for API key validity, enabled status, and daily token limits.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 */
async function authenticateRequest(req, res, next) {
    if (!usersConfig || !usersConfig.users || Object.keys(usersConfig.users).length === 0) {
        req.authenticated = true;
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Authorization header missing or invalid format (Bearer <key> required)." });
    }

    const apiKey = authHeader.split(' ');
    const user_info = usersConfig.users[apiKey];

    if (!user_info || !user_info.enabled) {
        return res.status(403).json({ error: "Invalid or disabled API key." });
    }

    const userPlan = user_info.plan || "0";
    const dailyLimit = getDailyLimitFromPlan(userPlan);

    if (dailyLimit !== null && dailyLimit >= 0) {
        let lastUsageTimestamp = user_info.last_usage_timestamp;
        let dailyTokensUsed = user_info.daily_tokens_used || 0;

        if (isNewDay(lastUsageTimestamp)) {
            dailyTokensUsed = 0;
        }

        if (dailyTokensUsed >= dailyLimit) {
            const limitStr = dailyLimit > 0 ? dailyLimit.toLocaleString() : "0";
            return res.status(429).json({
                error: {
                    message: `You have reached or exceeded your daily token limit of ${limitStr} tokens. Limit resets UTC midnight.`,
                    type: "tokens",
                    code: "daily_limit_exceeded"
                }
            });
        }
    }

    req.authenticatedApiKey = apiKey;
    req.authenticatedUserInfo = user_info;
    const limitDisplay = dailyLimit !== null && dailyLimit >= 0 ? dailyLimit.toLocaleString() : 'Unlimited';
    req.authenticated = true;
    next();
}




/**
 * GET /admin/keys
 * Retrieves the current user/key configurations. Requires ADMIN_API_KEY.
 */
app.get('/admin/keys', async (req, res) => {
    const authHeader = req.headers.authorization;
    let providedApiKey = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        providedApiKey = authHeader.split(' ');
    }

    if (providedApiKey !== ADMIN_API_KEY) {
        return res.status(403).json({ error: "Forbidden: Invalid admin API key." });
    }

    try {
        await loadConfigurations();
        const currentUsersData = usersConfig.users;

        res.status(200).json({ users: currentUsersData });
    } catch (e) {
        res.status(500).json({ error: `Internal server error processing ExoML Router Admin GET request: ${e.message}` });
    }
});



/**
 * GET /v1/models
 * Returns a list of available models based on the loaded provider configuration.
 * Conforms to the OpenAI API spec for listing models.
 */
app.get('/v1/models', (req, res) => {
    res.status(200).json({ object: 'list', data: availableModelsList });
});

/**
 * GET /v1/usage
 * Returns aggregate token usage statistics (total and daily).
 */
app.get('/v1/usage', async (req, res) => {

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
});

/**
 * POST /v1/*
 * Handles API requests to proxied provider endpoints (e.g., /v1/chat/completions).
 * Authenticates the request, selects a provider based on priority, and forwards the request.
 * Handles both streaming (SSE) and non-streaming responses.
 * Updates user token counts after successful requests.
 */
app.post('/v1/*', authenticateRequest, async (req, res) => {

    if (!providersConfig || !providersConfig.endpoints) {
        return res.status(500).json({ error: "Provider configuration is missing or invalid." });
    }

    const endpointConfig = providersConfig.endpoints[req.path];
    if (!endpointConfig || !endpointConfig.models) {
        return res.status(400).json({ error: `Configuration missing for endpoint: ${req.path}` });
    }

    const requestedModel = req.body.model;
    if (!requestedModel) {
        return res.status(400).json({ error: "Missing 'model' field in request body." });
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

    const sortedProviders = providers.sort((a, b) => (a.priority || 99) - (b.priority || 99));

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

        const targetUrl = `${baseUrl.replace(/\/+$/, '')}${req.path}`;

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
});

/**
 * POST /admin/keys
 * Manages user API keys: add, enable, disable, change plan, reset key. Requires ADMIN_API_KEY.
 */
app.post('/admin/keys', async (req, res) => {
    const authHeader = req.headers.authorization;
    let providedApiKey = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        providedApiKey = authHeader.split(' ');
    }

    if (providedApiKey !== ADMIN_API_KEY) {
        return res.status(403).json({ error: "Forbidden: Invalid admin API key." });
    }

    try {
        const { action, api_key: targetApiKey, username, plan: newPlan, user_id } = req.body;

        if (!action || !targetApiKey) {
            return res.status(400).json({ error: "Missing 'action' or 'api_key' in ExoML Router admin request body." });
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
                    return res.status(400).json({ error: "Missing 'username' for 'add' action." });
                }
                const planToAdd = newPlan || "0";
                if (!validPlans.includes(planToAdd)) {
                    return res.status(400).json({ error: `Invalid plan '${planToAdd}'. Valid plans: ${validPlans}` });
                }
                if (usersDict[targetApiKey]) {
                    return res.status(409).json({ error: `API key ...${targetApiKey.slice(-4)} already exists.` });
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
                    return res.status(404).json({ error: `API key ...${targetApiKey.slice(-4)} not found.` });
                }
                const newStatus = (action === 'enable');
                if (user_data_status.enabled === newStatus) {
                    return res.status(200).json({ message: `API key ...${targetApiKey.slice(-4)} is already ${action}d.` });
                }
                user_data_status.enabled = newStatus;
                user_data_status.last_updated_timestamp = Math.floor(Date.now() / 1000);
                configChanged = true;
                res.status(200).json({ message: `API key ...${targetApiKey.slice(-4)} has been ${action}d.` });
                break;

            case 'change_plan':
                const user_data_plan = usersDict[targetApiKey];
                if (!user_data_plan) {
                    return res.status(404).json({ error: `API key ...${targetApiKey.slice(-4)} not found.` });
                }
                if (!newPlan) {
                    return res.status(400).json({ error: "Missing 'new_plan' parameter for 'change_plan' action." });
                }
                if (!validPlans.includes(newPlan)) {
                    return res.status(400).json({ error: `Invalid plan '${newPlan}'. Valid plans: ${validPlans}` });
                }
                const oldPlan = user_data_plan.plan || 'N/A';
                if (oldPlan === newPlan) {
                    return res.status(200).json({ message: `API key ...${targetApiKey.slice(-4)} already has plan '${newPlan}'.` });
                }
                user_data_plan.plan = newPlan;
                user_data_plan.last_updated_timestamp = Math.floor(Date.now() / 1000);
                configChanged = true;
                res.status(200).json({ message: `Plan for API key ...${targetApiKey.slice(-4)} changed from '${oldPlan}' to '${newPlan}'.` });
                break;

            case 'resetkey':
                const user_data_reset = usersDict[targetApiKey];
                if (!user_data_reset) {
                    return res.status(404).json({ error: `API key ...${targetApiKey.slice(-4)} not found.` });
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
                return res.status(400).json({ error: `Invalid ExoML Router admin action: ${action}. Valid actions: add, enable, disable, change_plan, resetkey.` });
        }

        if (configChanged) {
            if (!(await saveUsersConfig(currentUsersConfig))) {
            } else {
                usersConfig = currentUsersConfig;
            }
        } else {
        }

    } catch (e) {
        if (e instanceof SyntaxError) {
            res.status(400).json({ error: "Invalid JSON in ExoML Router admin request body." });
        } else {
            res.status(500).json({ error: `Internal server error processing ExoML Router admin POST request: ${e.message}` });
        }
    }
});



/**
 * GET /
 * Serves the main index.html page, injecting the total processed tokens.
 */
app.get('/', async (req, res) => {
    try {
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
                return res.status(404).send("File Not Found: index.html");
            }
            throw e;
        }

        const modifiedHtmlContent = htmlContent.replace('<!-- TOTAL_TOKENS -->', formattedTotalTokens);

        res.status(200).setHeader("Content-Type", "text/html; charset=utf-8")
                       .setHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                       .setHeader("Pragma", "no-cache")
                       .setHeader("Expires", "0")
                       .send(modifiedHtmlContent);
    } catch (e) {
        res.status(500).send("ExoML Router: Internal Server Error serving index.html");
    }
});

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
app.get('/chat', async (req, res) => {
    try {
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
    } catch (e) {
        res.status(500).send("ExoML Router: Internal Server Error serving chat.html");
    }
});


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

startServer();

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
