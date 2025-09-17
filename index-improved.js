const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Import utilities
const logger = require('./utils/logger');
const config = require('./utils/config');
const { validateApiKey, validators, RateLimiter } = require('./utils/security');
const ProviderUtils = require('./utils/providers');
const { httpClient } = require('./utils/performance');
const { 
    errorHandler, 
    asyncHandler, 
    ValidationError, 
    AuthenticationError,
    NotFoundError,
    getProviderCircuitBreaker 
} = require('./utils/errorHandler');
const { metricsCollector, healthCheckManager, checkProviderHealth } = require('./utils/monitoring');

const app = express();

// Rate limiter
const rateLimiter = new RateLimiter(
    config.get('security.rateLimiting.windowMs'),
    config.get('security.rateLimiting.maxRequests')
);

// Middleware
app.use(cors(config.get('server.cors')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging and metrics
app.use((req, res, next) => {
    const startTime = Date.now();
    
    logger.info('Request received', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        const success = res.statusCode < 400;
        
        metricsCollector.recordRequest(
            req.route?.path || req.url,
            req.provider,
            success,
            responseTime
        );
        
        logger.info('Request completed', {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            responseTime
        });
    });
    
    next();
});

// Rate limiting middleware
app.use((req, res, next) => {
    const clientId = req.ip;
    
    if (!rateLimiter.isAllowed(clientId)) {
        const resetTime = rateLimiter.getResetTime(clientId);
        
        res.set({
            'X-RateLimit-Limit': config.get('security.rateLimiting.maxRequests'),
            'X-RateLimit-Remaining': 0,
            'X-RateLimit-Reset': new Date(resetTime).toISOString()
        });
        
        return res.status(429).json({
            success: false,
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests, please try again later'
            }
        });
    }
    
    const remaining = rateLimiter.getRemainingRequests(clientId);
    res.set('X-RateLimit-Remaining', remaining);
    
    next();
});

// Authentication middleware
const authenticate = (req, res, next) => {
    const apiKey = req.get(config.get('security.apiKeyHeader'));
    const validApiKey = process.env.API_KEY || 'your-secret-api-key';
    
    if (!validateApiKey(apiKey, validApiKey)) {
        throw new AuthenticationError('Invalid API key');
    }
    
    next();
};

// Input validation middleware
const validateInput = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        throw new ValidationError(error.details[0].message);
    }
    next();
};

// Load providers data
let providersData = [];

function loadProviders() {
    try {
        const providersPath = config.get('providers.configPath');
        if (fs.existsSync(providersPath)) {
            const data = fs.readFileSync(providersPath, 'utf8');
            providersData = JSON.parse(data);
            logger.info('Providers loaded successfully', { count: providersData.length });
            
            // Register health checks for providers
            providersData.forEach(provider => {
                if (provider.healthEndpoint) {
                    healthCheckManager.register(
                        `provider-${provider.name}`,
                        () => checkProviderHealth(provider),
                        { critical: false }
                    );
                }
            });
        }
    } catch (error) {
        logger.error('Failed to load providers', { error: error.message });
    }
}

// Load providers on startup
loadProviders();

// Routes

// Health check endpoint
app.get('/health', asyncHandler(async (req, res) => {
    const health = healthCheckManager.getHealth();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json({
        success: true,
        data: health
    });
}));

// Metrics endpoint
app.get('/metrics', asyncHandler(async (req, res) => {
    const metrics = metricsCollector.getMetrics();
    
    res.json({
        success: true,
        data: metrics
    });
}));

// Get all providers
app.get('/providers', asyncHandler(async (req, res) => {
    const { name, type, available, modelType, sortBy = 'name', order = 'asc' } = req.query;
    
    // Validate query parameters
    if (available && !['true', 'false'].includes(available)) {
        throw new ValidationError('available must be true or false');
    }
    
    const filters = {
        ...(name && { name }),
        ...(type && { type }),
        ...(available && { available: available === 'true' }),
        ...(modelType && { modelType })
    };
    
    let filtered = ProviderUtils.filterProviders(providersData, filters);
    filtered = ProviderUtils.sortProviders(filtered, sortBy, order);
    
    const stats = ProviderUtils.getProviderStats(filtered);
    
    res.json({
        success: true,
        data: filtered,
        meta: {
            total: filtered.length,
            stats
        }
    });
}));

// Get specific provider
app.get('/providers/:name', asyncHandler(async (req, res) => {
    const { name } = req.params;
    
    if (!validators.isValidString(name)) {
        throw new ValidationError('Invalid provider name');
    }
    
    const provider = providersData.find(p => 
        p.name.toLowerCase() === name.toLowerCase()
    );
    
    if (!provider) {
        throw new NotFoundError(`Provider '${name}' not found`);
    }
    
    req.provider = provider.name;
    
    res.json({
        success: true,
        data: provider
    });
}));

// Chat endpoint with provider selection
app.post('/chat', authenticate, asyncHandler(async (req, res) => {
    const { message, provider: preferredProvider, model, options = {} } = req.body;
    
    // Validate input
    if (!validators.isValidString(message, 10000)) {
        throw new ValidationError('Message is required and must be less than 10000 characters');
    }
    
    // Find best provider
    let selectedProvider;
    if (preferredProvider) {
        selectedProvider = providersData.find(p => 
            p.name.toLowerCase() === preferredProvider.toLowerCase()
        );
        if (!selectedProvider) {
            throw new ValidationError(`Provider '${preferredProvider}' not found`);
        }
    } else {
        selectedProvider = ProviderUtils.findBestProvider(providersData, 'chat');
        if (!selectedProvider) {
            throw new ValidationError('No available chat providers');
        }
    }
    
    req.provider = selectedProvider.name;
    
    // Use circuit breaker for provider calls
    const circuitBreaker = getProviderCircuitBreaker(selectedProvider.name);
    
    try {
        const response = await circuitBreaker.execute(async () => {
            // Simulate provider API call
            const providerResponse = await httpClient.request(`${selectedProvider.baseURL}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${selectedProvider.apiKey}`
                },
                body: JSON.stringify({
                    message: validators.sanitizeString(message),
                    model,
                    ...options
                })
            });
            
            return providerResponse;
        });
        
        res.json({
            success: true,
            data: {
                response: response.message || 'Response from provider',
                provider: selectedProvider.name,
                model: model || 'default'
            }
        });
        
    } catch (error) {
        logger.error('Provider request failed', {
            provider: selectedProvider.name,
            error: error.message
        });
        
        throw new Error(`Provider request failed: ${error.message}`);
    }
}));

// File upload endpoint
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['text/csv', 'application/json', 'text/plain'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new ValidationError('Invalid file type'));
        }
    }
});

app.post('/upload', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ValidationError('No file uploaded');
    }
    
    const { originalname, filename, mimetype, size } = req.file;
    
    logger.info('File uploaded', {
        originalname,
        filename,
        mimetype,
        size
    });
    
    res.json({
        success: true,
        data: {
            filename: originalname,
            size,
            type: mimetype,
            uploadedAt: new Date().toISOString()
        }
    });
}));

// Serve static files
app.use('/static', express.static('public'));

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: 'Endpoint not found'
        }
    });
});

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Start server
const PORT = config.get('server.port');
const HOST = config.get('server.host');

const server = app.listen(PORT, HOST, () => {
    logger.info('Server started', {
        port: PORT,
        host: HOST,
        environment: process.env.NODE_ENV || 'development'
    });
});

// Handle server errors
server.on('error', (error) => {
    logger.error('Server error', { error: error.message });
    process.exit(1);
});

module.exports = app;