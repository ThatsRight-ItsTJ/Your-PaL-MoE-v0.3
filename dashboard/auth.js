/**
 * Dashboard Authentication and Authorization
 * Handles user authentication, session management, and role-based access control
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

class DashboardAuth {
    constructor(options = {}) {
        this.users = options.users || {
            admin: {
                password: this.hashPassword('admin123'),
                role: 'admin',
                permissions: ['read', 'write', 'delete', 'admin']
            },
            viewer: {
                password: this.hashPassword('viewer123'),
                role: 'viewer',
                permissions: ['read']
            },
            operator: {
                password: this.hashPassword('operator123'),
                role: 'operator',
                permissions: ['read', 'write']
            }
        };

        this.sessions = new Map();
        this.sessionTimeout = options.sessionTimeout || 3600000; // 1 hour
        this.maxSessionsPerUser = options.maxSessionsPerUser || 5;

        // Role definitions with permissions
        this.roles = {
            admin: {
                name: 'Administrator',
                permissions: ['read', 'write', 'delete', 'admin', 'system'],
                description: 'Full system access'
            },
            operator: {
                name: 'Operator',
                permissions: ['read', 'write', 'system'],
                description: 'Can modify system settings and view all data'
            },
            viewer: {
                name: 'Viewer',
                permissions: ['read'],
                description: 'Read-only access to monitoring data'
            }
        };

        // Start session cleanup
        this.startSessionCleanup();
    }

    /**
     * Hash password using SHA-256
     */
    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    /**
     * Generate session token
     */
    generateSessionToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Authenticate user
     */
    authenticate(username, password) {
        const user = this.users[username];
        if (!user) {
            logger.warn(`Authentication failed: user ${username} not found`);
            return null;
        }

        const hashedPassword = this.hashPassword(password);
        if (user.password !== hashedPassword) {
            logger.warn(`Authentication failed: invalid password for user ${username}`);
            return null;
        }

        // Check if user already has too many sessions
        const userSessions = Array.from(this.sessions.values())
            .filter(session => session.username === username);

        if (userSessions.length >= this.maxSessionsPerUser) {
            // Remove oldest session
            const oldestSession = userSessions
                .sort((a, b) => a.created - b.created)[0];
            this.sessions.delete(oldestSession.token);
        }

        // Create new session
        const token = this.generateSessionToken();
        const session = {
            token,
            username,
            role: user.role,
            permissions: user.permissions,
            created: Date.now(),
            lastActivity: Date.now(),
            ip: null, // Will be set by middleware
            userAgent: null // Will be set by middleware
        };

        this.sessions.set(token, session);

        logger.info(`User ${username} authenticated successfully`);

        return {
            token,
            username,
            role: user.role,
            permissions: user.permissions
        };
    }

    /**
     * Validate session token
     */
    validateSession(token) {
        const session = this.sessions.get(token);
        if (!session) {
            return null;
        }

        // Check if session has expired
        if (Date.now() - session.created > this.sessionTimeout) {
            this.sessions.delete(token);
            logger.info(`Session expired for user ${session.username}`);
            return null;
        }

        // Update last activity
        session.lastActivity = Date.now();

        return {
            username: session.username,
            role: session.role,
            permissions: session.permissions
        };
    }

    /**
     * Logout user (invalidate session)
     */
    logout(token) {
        const session = this.sessions.get(token);
        if (session) {
            logger.info(`User ${session.username} logged out`);
            this.sessions.delete(token);
            return true;
        }
        return false;
    }

    /**
     * Check if user has permission
     */
    hasPermission(user, permission) {
        if (!user || !user.permissions) {
            return false;
        }

        return user.permissions.includes(permission) ||
               user.permissions.includes('admin');
    }

    /**
     * Check if user has role
     */
    hasRole(user, role) {
        return user && user.role === role;
    }

    /**
     * Get user by username
     */
    getUser(username) {
        return this.users[username] || null;
    }

    /**
     * Get role definition
     */
    getRole(roleName) {
        return this.roles[roleName] || null;
    }

    /**
     * Get all roles
     */
    getAllRoles() {
        return Object.keys(this.roles).map(roleName => ({
            name: roleName,
            ...this.roles[roleName]
        }));
    }

    /**
     * Add user
     */
    addUser(username, password, role = 'viewer') {
        if (this.users[username]) {
            throw new Error(`User ${username} already exists`);
        }

        if (!this.roles[role]) {
            throw new Error(`Invalid role: ${role}`);
        }

        this.users[username] = {
            password: this.hashPassword(password),
            role,
            permissions: this.roles[role].permissions
        };

        logger.info(`User ${username} created with role ${role}`);
        return { username, role };
    }

    /**
     * Update user
     */
    updateUser(username, updates) {
        const user = this.users[username];
        if (!user) {
            throw new Error(`User ${username} not found`);
        }

        if (updates.password) {
            user.password = this.hashPassword(updates.password);
        }

        if (updates.role) {
            if (!this.roles[updates.role]) {
                throw new Error(`Invalid role: ${updates.role}`);
            }
            user.role = updates.role;
            user.permissions = this.roles[updates.role].permissions;
        }

        logger.info(`User ${username} updated`);
        return { username, role: user.role };
    }

    /**
     * Delete user
     */
    deleteUser(username) {
        if (!this.users[username]) {
            throw new Error(`User ${username} not found`);
        }

        // Logout all sessions for this user
        for (const [token, session] of this.sessions) {
            if (session.username === username) {
                this.sessions.delete(token);
            }
        }

        delete this.users[username];
        logger.info(`User ${username} deleted`);
        return true;
    }

    /**
     * Get active sessions
     */
    getActiveSessions() {
        return Array.from(this.sessions.values()).map(session => ({
            username: session.username,
            role: session.role,
            created: session.created,
            lastActivity: session.lastActivity,
            ip: session.ip,
            userAgent: session.userAgent
        }));
    }

    /**
     * Get user sessions
     */
    getUserSessions(username) {
        return Array.from(this.sessions.values())
            .filter(session => session.username === username)
            .map(session => ({
                token: session.token,
                created: session.created,
                lastActivity: session.lastActivity,
                ip: session.ip
            }));
    }

    /**
     * Force logout user
     */
    forceLogoutUser(username) {
        let count = 0;
        for (const [token, session] of this.sessions) {
            if (session.username === username) {
                this.sessions.delete(token);
                count++;
            }
        }

        if (count > 0) {
            logger.info(`Forced logout of ${count} sessions for user ${username}`);
        }

        return count;
    }

    /**
     * Start session cleanup interval
     */
    startSessionCleanup() {
        // Clean up expired sessions every 5 minutes
        setInterval(() => {
            const now = Date.now();
            let cleaned = 0;

            for (const [token, session] of this.sessions) {
                if (now - session.created > this.sessionTimeout) {
                    this.sessions.delete(token);
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                logger.info(`Cleaned up ${cleaned} expired sessions`);
            }
        }, 300000); // 5 minutes
    }

    /**
     * Get authentication statistics
     */
    getStats() {
        const now = Date.now();
        const activeSessions = Array.from(this.sessions.values());
        const recentSessions = activeSessions.filter(s => now - s.created < 3600000); // Last hour

        return {
            totalUsers: Object.keys(this.users).length,
            activeSessions: activeSessions.length,
            recentSessions: recentSessions.length,
            sessionsByRole: this.getSessionsByRole(),
            averageSessionDuration: this.getAverageSessionDuration()
        };
    }

    /**
     * Get sessions grouped by role
     */
    getSessionsByRole() {
        const byRole = {};

        for (const session of this.sessions.values()) {
            byRole[session.role] = (byRole[session.role] || 0) + 1;
        }

        return byRole;
    }

    /**
     * Get average session duration
     */
    getAverageSessionDuration() {
        const sessions = Array.from(this.sessions.values());
        if (sessions.length === 0) return 0;

        const totalDuration = sessions.reduce((sum, session) => {
            return sum + (Date.now() - session.created);
        }, 0);

        return totalDuration / sessions.length / 1000; // in seconds
    }

    /**
     * Middleware for authentication
     */
    authMiddleware(requiredPermission = null) {
        return (req, res, next) => {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Bearer token required'
                });
            }

            const token = authHeader.substring(7); // Remove 'Bearer ' prefix
            const user = this.validateSession(token);

            if (!user) {
                return res.status(401).json({
                    error: 'Invalid or expired token',
                    message: 'Please authenticate again'
                });
            }

            // Update session with request info
            const session = this.sessions.get(token);
            if (session) {
                session.ip = req.ip;
                session.userAgent = req.get('User-Agent');
                session.lastActivity = Date.now();
            }

            // Check permission if required
            if (requiredPermission && !this.hasPermission(user, requiredPermission)) {
                return res.status(403).json({
                    error: 'Insufficient permissions',
                    message: `Required permission: ${requiredPermission}`
                });
            }

            req.user = user;
            next();
        };
    }

    /**
     * Admin-only middleware
     */
    adminMiddleware() {
        return this.authMiddleware('admin');
    }

    /**
     * Write access middleware
     */
    writeMiddleware() {
        return this.authMiddleware('write');
    }

    /**
     * Read access middleware (default)
     */
    readMiddleware() {
        return this.authMiddleware('read');
    }
}

module.exports = DashboardAuth;