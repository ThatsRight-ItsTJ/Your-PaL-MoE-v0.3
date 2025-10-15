/**
 * Delta Detection Logic
 * Detects changes in model availability and generates efficient updates
 * Supports incremental updates and change tracking
 */

const logger = require('../utils/logger');

class DeltaDetector {
    constructor(modelTracker) {
        this.modelTracker = modelTracker;

        // Change tracking storage
        this.previousStates = new Map(); // providerName -> { models: Set, timestamp: Date }
        this.changeHistory = new Map(); // providerName -> changeLog[]
        this.modelLifecycles = new Map(); // modelId -> lifecycle

        // Detection configuration
        this.config = {
            enableDetailedLogging: true,
            maxHistorySize: 1000,
            changeThreshold: 0.1, // 10% change threshold for significant updates
            retentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
            enableModelLifecycleTracking: true
        };

        // Statistics
        this.stats = {
            totalComparisons: 0,
            changesDetected: 0,
            modelsAdded: 0,
            modelsRemoved: 0,
            modelsModified: 0,
            significantUpdates: 0
        };

        logger.info('DeltaDetector initialized');
    }

    /**
     * Compare current state with previous state for a provider
     */
    async detectChanges(providerName, currentModels) {
        this.stats.totalComparisons++;

        try {
            const previousState = this.previousStates.get(providerName);
            const currentState = this.createStateSnapshot(currentModels);

            if (!previousState) {
                // First time seeing this provider
                const changes = this.createInitialChanges(providerName, currentModels);
                this.updateState(providerName, currentState);
                return changes;
            }

            // Perform delta comparison
            const changes = this.compareStates(providerName, previousState, currentState);

            // Update state if changes detected
            if (changes.hasChanges) {
                this.updateState(providerName, currentState);
                this.recordChanges(providerName, changes);
                this.stats.changesDetected++;
            }

            return changes;

        } catch (error) {
            logger.error(`Delta detection failed for ${providerName}: ${error.message}`);
            return this.createErrorResult(error.message);
        }
    }

    /**
     * Create initial changes for new provider
     */
    createInitialChanges(providerName, models) {
        const changes = {
            provider: providerName,
            timestamp: new Date(),
            hasChanges: true,
            isInitial: true,
            summary: {
                totalCurrent: models.length,
                added: models.length,
                removed: 0,
                modified: 0
            },
            details: {
                added: models.map(model => ({
                    id: model.id,
                    name: model.name,
                    type: 'added',
                    reason: 'initial_discovery'
                })),
                removed: [],
                modified: []
            }
        };

        this.stats.modelsAdded += models.length;
        return changes;
    }

    /**
     * Compare two state snapshots
     */
    compareStates(providerName, previousState, currentState) {
        const previousModels = new Map(previousState.models.map(m => [m.id, m]));
        const currentModels = new Map(currentState.models.map(m => [m.id, m]));

        const added = [];
        const removed = [];
        const modified = [];

        // Find added models
        for (const [id, model] of currentModels) {
            if (!previousModels.has(id)) {
                added.push({
                    id: model.id,
                    name: model.name,
                    type: 'added',
                    reason: 'new_discovery'
                });
                this.stats.modelsAdded++;
            }
        }

        // Find removed models
        for (const [id, model] of previousModels) {
            if (!currentModels.has(id)) {
                removed.push({
                    id: model.id,
                    name: model.name,
                    type: 'removed',
                    reason: 'no_longer_available'
                });
                this.stats.modelsRemoved++;
            }
        }

        // Find modified models
        for (const [id, currentModel] of currentModels) {
            const previousModel = previousModels.get(id);
            if (previousModel) {
                const modifications = this.detectModelModifications(previousModel, currentModel);
                if (modifications.length > 0) {
                    modified.push({
                        id: currentModel.id,
                        name: currentModel.name,
                        type: 'modified',
                        modifications: modifications
                    });
                    this.stats.modelsModified++;
                }
            }
        }

        const totalChanges = added.length + removed.length + modified.length;
        const totalModels = Math.max(previousState.models.length, currentState.models.length);
        const changeRatio = totalModels > 0 ? totalChanges / totalModels : 0;
        const isSignificant = changeRatio >= this.config.changeThreshold;

        if (isSignificant) {
            this.stats.significantUpdates++;
        }

        return {
            provider: providerName,
            timestamp: new Date(),
            hasChanges: totalChanges > 0,
            isInitial: false,
            isSignificant,
            summary: {
                totalPrevious: previousState.models.length,
                totalCurrent: currentState.models.length,
                added: added.length,
                removed: removed.length,
                modified: modified.length,
                changeRatio: changeRatio
            },
            details: {
                added,
                removed,
                modified
            }
        };
    }

    /**
     * Detect modifications in a model
     */
    detectModelModifications(previousModel, currentModel) {
        const modifications = [];

        // Compare key fields
        const fieldsToCompare = [
            'name', 'description', 'capabilities', 'parameters',
            'metrics', 'tags', 'api'
        ];

        for (const field of fieldsToCompare) {
            const prevValue = previousModel[field];
            const currValue = currentModel[field];

            if (!this.deepEqual(prevValue, currValue)) {
                modifications.push({
                    field,
                    previous: prevValue,
                    current: currValue,
                    type: this.getModificationType(field, prevValue, currValue)
                });
            }
        }

        // Special handling for timestamps
        if (previousModel.last_updated !== currentModel.last_updated) {
            modifications.push({
                field: 'last_updated',
                previous: previousModel.last_updated,
                current: currentModel.last_updated,
                type: 'timestamp_update'
            });
        }

        return modifications;
    }

    /**
     * Get modification type based on field and values
     */
    getModificationType(field, previous, current) {
        if (field === 'capabilities' || field === 'tags') {
            if (Array.isArray(previous) && Array.isArray(current)) {
                const added = current.filter(item => !previous.includes(item));
                const removed = previous.filter(item => !current.includes(item));

                if (added.length > 0 && removed.length === 0) return 'capabilities_added';
                if (removed.length > 0 && added.length === 0) return 'capabilities_removed';
                if (added.length > 0 && removed.length > 0) return 'capabilities_changed';
            }
        }

        if (field === 'parameters' || field === 'metrics') {
            return 'metadata_update';
        }

        if (field === 'api') {
            return 'api_config_update';
        }

        return 'field_update';
    }

    /**
     * Create state snapshot
     */
    createStateSnapshot(models) {
        return {
            models: models.map(model => ({
                id: model.id,
                name: model.name,
                capabilities: model.capabilities || [],
                tags: model.tags || [],
                last_updated: model.last_updated,
                parameters: model.parameters,
                metrics: model.metrics,
                api: model.api
            })),
            timestamp: new Date(),
            count: models.length
        };
    }

    /**
     * Update stored state for provider
     */
    updateState(providerName, state) {
        this.previousStates.set(providerName, state);

        // Update model lifecycles
        if (this.config.enableModelLifecycleTracking) {
            this.updateModelLifecycles(providerName, state.models);
        }
    }

    /**
     * Update model lifecycle tracking
     */
    updateModelLifecycles(providerName, models) {
        const now = new Date();

        for (const model of models) {
            const lifecycle = this.modelLifecycles.get(model.id) || {
                id: model.id,
                provider: providerName,
                first_seen: now,
                last_seen: now,
                seen_count: 0,
                status: 'active',
                availability_history: []
            };

            lifecycle.last_seen = now;
            lifecycle.seen_count++;
            lifecycle.status = 'active';

            // Record availability
            lifecycle.availability_history.push({
                timestamp: now,
                available: true,
                provider: providerName
            });

            // Keep only recent history (last 100 entries)
            if (lifecycle.availability_history.length > 100) {
                lifecycle.availability_history = lifecycle.availability_history.slice(-100);
            }

            this.modelLifecycles.set(model.id, lifecycle);
        }
    }

    /**
     * Record changes in history
     */
    recordChanges(providerName, changes) {
        if (!this.changeHistory.has(providerName)) {
            this.changeHistory.set(providerName, []);
        }

        const history = this.changeHistory.get(providerName);
        history.push(changes);

        // Maintain history size limit
        if (history.length > this.config.maxHistorySize) {
            history.shift();
        }

        if (this.config.enableDetailedLogging) {
            logger.info(`Changes detected for ${providerName}: +${changes.summary.added} -${changes.summary.removed} ~${changes.summary.modified}`);
        }
    }

    /**
     * Get change history for provider
     */
    getChangeHistory(providerName, limit = 50) {
        const history = this.changeHistory.get(providerName) || [];
        return history.slice(-limit);
    }

    /**
     * Get model lifecycle information
     */
    getModelLifecycle(modelId) {
        return this.modelLifecycles.get(modelId);
    }

    /**
     * Get availability statistics for a model
     */
    getModelAvailabilityStats(modelId) {
        const lifecycle = this.getModelLifecycle(modelId);
        if (!lifecycle) return null;

        const history = lifecycle.availability_history;
        const totalChecks = history.length;
        const availableChecks = history.filter(h => h.available).length;
        const availabilityRate = totalChecks > 0 ? availableChecks / totalChecks : 0;

        const now = Date.now();
        const last24h = history.filter(h => (now - h.timestamp.getTime()) < 24 * 60 * 60 * 1000);
        const recentAvailability = last24h.length > 0 ? last24h.filter(h => h.available).length / last24h.length : 0;

        return {
            modelId,
            totalChecks,
            availableChecks,
            availabilityRate,
            recentAvailability,
            firstSeen: lifecycle.first_seen,
            lastSeen: lifecycle.last_seen,
            status: lifecycle.status
        };
    }

    /**
     * Get delta detection statistics
     */
    getStats() {
        const providersTracked = this.previousStates.size;
        const modelsTracked = this.modelLifecycles.size;

        return {
            ...this.stats,
            providersTracked,
            modelsTracked,
            averageChangesPerComparison: this.stats.totalComparisons > 0 ?
                this.stats.changesDetected / this.stats.totalComparisons : 0
        };
    }

    /**
     * Create error result
     */
    createErrorResult(error) {
        return {
            hasChanges: false,
            error: true,
            errorMessage: error,
            timestamp: new Date()
        };
    }

    /**
     * Deep equality check for objects
     */
    deepEqual(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return a === b;
        if (typeof a !== typeof b) return false;

        if (typeof a === 'object') {
            if (Array.isArray(a) && Array.isArray(b)) {
                if (a.length !== b.length) return false;
                for (let i = 0; i < a.length; i++) {
                    if (!this.deepEqual(a[i], b[i])) return false;
                }
                return true;
            }

            if (Array.isArray(a) || Array.isArray(b)) return false;

            const keysA = Object.keys(a);
            const keysB = Object.keys(b);

            if (keysA.length !== keysB.length) return false;

            for (const key of keysA) {
                if (!keysB.includes(key)) return false;
                if (!this.deepEqual(a[key], b[key])) return false;
            }

            return true;
        }

        return false;
    }

    /**
     * Clean up old data
     */
    cleanup(maxAge = this.config.retentionPeriod) {
        const cutoff = Date.now() - maxAge;
        let cleaned = 0;

        // Clean up old change history
        for (const [provider, history] of this.changeHistory) {
            const filtered = history.filter(entry => entry.timestamp.getTime() > cutoff);
            cleaned += history.length - filtered.length;
            this.changeHistory.set(provider, filtered);
        }

        // Clean up old model lifecycles
        for (const [modelId, lifecycle] of this.modelLifecycles) {
            if (lifecycle.last_seen.getTime() < cutoff) {
                this.modelLifecycles.delete(modelId);
                cleaned++;
            }
        }

        logger.info(`Cleaned up ${cleaned} old records`);
        return cleaned;
    }

    /**
     * Configure detector settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('DeltaDetector configuration updated', this.config);
    }

    /**
     * Reset detector state
     */
    reset() {
        this.previousStates.clear();
        this.changeHistory.clear();
        this.modelLifecycles.clear();
        this.stats = {
            totalComparisons: 0,
            changesDetected: 0,
            modelsAdded: 0,
            modelsRemoved: 0,
            modelsModified: 0,
            significantUpdates: 0
        };
        logger.info('DeltaDetector state reset');
    }
}

module.exports = DeltaDetector;