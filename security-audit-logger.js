const fs = require('fs').promises;
const path = require('path');

/**
 * Security Audit Logger
 */
class SecurityAuditLogger {
  constructor(options = {}) {
    this.logDirectory = options.logDirectory || './logs/security-audit';
    this.logLevel = options.logLevel || 'info'; // debug, info, warn, error
    this.maxLogSize = options.maxLogSize || 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = options.maxLogFiles || 10;
    this.enabled = options.enabled !== false;
    
    // Ensure log directory exists
    this.ensureLogDirectory();
  }

  /**
   * Ensure log directory exists
   */
  async ensureLogDirectory() {
    try {
      await fs.mkdir(this.logDirectory, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  /**
   * Log security event
   */
  async logEvent(eventType, details, user = null, request = null) {
    if (!this.enabled) return;
    
    // Check if we should log this event based on log level
    if (!this.shouldLogEvent(eventType)) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      event_type: eventType,
      details: details,
      user: user ? {
        id: user.id || user.user_id || 'unknown',
        username: user.username || 'unknown',
        api_key: user.api_key ? `${user.api_key.slice(0, 8)}...` : 'unknown'
      } : null,
      request: request ? {
        method: request.method,
        path: request.path,
        ip: request.ip,
        user_agent: request.get('User-Agent'),
        headers: this.sanitizeHeaders(request.headers)
      } : null,
      severity: this.getEventSeverity(eventType)
    };
    
    try {
      await this.writeLogEntry(logEntry);
    } catch (error) {
      console.error('Failed to write security audit log:', error);
    }
  }

  /**
   * Check if event should be logged based on log level
   */
  shouldLogEvent(eventType) {
    const severityOrder = ['debug', 'info', 'warn', 'error'];
    const eventSeverity = this.getEventSeverity(eventType);
    const currentLevelIndex = severityOrder.indexOf(this.logLevel);
    const eventLevelIndex = severityOrder.indexOf(eventSeverity);
    
    return eventLevelIndex >= currentLevelIndex;
  }

  /**
   * Get event severity
   */
  getEventSeverity(eventType) {
    if (eventType.includes('error') || eventType.includes('fail') || eventType.includes('attack')) {
      return 'error';
    }
    
    if (eventType.includes('warn') || eventType.includes('suspicious')) {
      return 'warn';
    }
    
    if (eventType.includes('debug')) {
      return 'debug';
    }
    
    return 'info';
  }

  /**
   * Sanitize headers for logging
   */
  sanitizeHeaders(headers) {
    if (!headers) return {};
    
    const sensitiveHeaders = [
      'authorization',
      'x-api-key',
      'cookie',
      'set-cookie',
      'x-forwarded-for',
      'x-real-ip'
    ];
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveHeaders.includes(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Write log entry to file
   */
  async writeLogEntry(logEntry) {
    const dateStr = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDirectory, `security-audit-${dateStr}.log`);
    
    // Check if we need to rotate logs
    await this.rotateLogsIfNeeded(logFile);
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    await fs.appendFile(logFile, logLine);
  }

  /**
   * Rotate logs if they exceed size limit
   */
  async rotateLogsIfNeeded(logFile) {
    try {
      const stats = await fs.stat(logFile);
      
      if (stats.size > this.maxLogSize) {
        await this.rotateLog(logFile);
      }
    } catch (error) {
      // File doesn't exist, which is fine
    }
  }

  /**
   * Rotate a single log file
   */
  async rotateLog(logFile) {
    const baseName = path.basename(logFile, '.log');
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedName = `${baseName}-${dateStr}.log`;
    const rotatedPath = path.join(this.logDirectory, rotatedName);
    
    // Rename the current log file
    await fs.rename(logFile, rotatedPath);
    
    // Clean up old rotated files if we have too many
    await this.cleanupOldLogs(baseName);
  }

  /**
   * Clean up old log files
   */
  async cleanupOldLogs(baseName) {
    try {
      const files = await fs.readdir(this.logDirectory);
      const rotatedFiles = files
        .filter(file => file.startsWith(baseName) && file.endsWith('.log'))
        .sort()
        .reverse();
      
      // Remove files beyond the limit
      const filesToRemove = rotatedFiles.slice(this.maxLogFiles);
      for (const file of filesToRemove) {
        await fs.unlink(path.join(this.logDirectory, file));
      }
    } catch (error) {
      console.error('Failed to clean up old log files:', error);
    }
  }

  /**
   * Log authentication events
   */
  async logAuthenticationEvent(eventType, details, request = null) {
    const user = request ? { 
      ip: request.ip, 
      user_agent: request.get('User-Agent') 
    } : null;
    
    await this.logEvent(eventType, details, user, request);
  }

  /**
   * Log authorization events
   */
  async logAuthorizationEvent(eventType, details, user, request = null) {
    await this.logEvent(eventType, details, user, request);
  }

  /**
   * Log input validation events
   */
  async logValidationEvent(eventType, details, request = null) {
    await this.logEvent(eventType, details, null, request);
  }

  /**
   * Log security policy violations
   */
  async logPolicyViolation(eventType, details, user, request = null) {
    await this.logEvent(eventType, details, user, request);
  }

  /**
   * Log suspicious activity
   */
  async logSuspiciousActivity(eventType, details, user, request = null) {
    await this.logEvent(`suspicious_${eventType}`, details, user, request);
  }

  /**
   * Log error events
   */
  async logError(eventType, error, user, request = null) {
    const details = {
      message: error.message,
      stack: error.stack,
      code: error.code
    };
    
    await this.logEvent(`error_${eventType}`, details, user, request);
  }
}

/**
 * Create and export audit logger instance
 */
const securityAuditLogger = new SecurityAuditLogger();

module.exports = {
  SecurityAuditLogger,
  securityAuditLogger
};