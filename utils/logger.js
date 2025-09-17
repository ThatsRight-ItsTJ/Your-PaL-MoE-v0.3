const fs = require('fs');
const path = require('path');

/**
 * Comprehensive logging system
 */
class Logger {
    constructor(options = {}) {
        this.level = options.level || 'info';
        this.format = options.format || 'json';
        this.file = options.file;
        this.console = options.console !== false;
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            trace: 4
        };
        
        // Ensure log directory exists
        if (this.file) {
            const logDir = path.dirname(this.file);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        }
    }
    
    /**
     * Check if a log level should be logged
     */
    shouldLog(level) {
        return this.levels[level] <= this.levels[this.level];
    }
    
    /**
     * Format log message
     */
    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...meta
        };
        
        if (this.format === 'json') {
            return JSON.stringify(logEntry);
        } else {
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
        }
    }
    
    /**
     * Write log entry
     */
    writeLog(level, message, meta = {}) {
        if (!this.shouldLog(level)) {
            return;
        }
        
        const formattedMessage = this.formatMessage(level, message, meta);
        
        // Console output
        if (this.console) {
            const consoleMethod = level === 'error' ? 'error' : 
                                 level === 'warn' ? 'warn' : 'log';
            console[consoleMethod](formattedMessage);
        }
        
        // File output
        if (this.file) {
            fs.appendFileSync(this.file, formattedMessage + '\n');
        }
    }
    
    /**
     * Log methods
     */
    error(message, meta = {}) {
        this.writeLog('error', message, meta);
    }
    
    warn(message, meta = {}) {
        this.writeLog('warn', message, meta);
    }
    
    info(message, meta = {}) {
        this.writeLog('info', message, meta);
    }
    
    debug(message, meta = {}) {
        this.writeLog('debug', message, meta);
    }
    
    trace(message, meta = {}) {
        this.writeLog('trace', message, meta);
    }
    
    /**
     * Create child logger with additional context
     */
    child(context = {}) {
        const childLogger = Object.create(this);
        childLogger.defaultMeta = { ...this.defaultMeta, ...context };
        
        // Override writeLog to include default meta
        const originalWriteLog = this.writeLog.bind(this);
        childLogger.writeLog = (level, message, meta = {}) => {
            originalWriteLog(level, message, { ...childLogger.defaultMeta, ...meta });
        };
        
        return childLogger;
    }
}

// Create default logger instance
const logger = new Logger({
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: process.env.LOG_FILE || './logs/app.log'
});

module.exports = logger;