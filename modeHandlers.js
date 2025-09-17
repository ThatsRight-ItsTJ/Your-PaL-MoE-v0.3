/**
 * Collaboration Mode Implementations
 * Handles different collaboration modes when multiple tools are used
 * Supports Council, Collaborate, Race, MetaJudge, Discuss, and Fallback modes
 */

class ModeHandlers {
    constructor(taskMaster) {
        this.taskMaster = taskMaster;
        this.modes = {
            council: this.councilMode.bind(this),
            collaborate: this.collaborateMode.bind(this),
            race: this.raceMode.bind(this),
            metajudge: this.metaJudgeMode.bind(this),
            discuss: this.discussMode.bind(this),
            fallback: this.fallbackMode.bind(this)
        };
    }

    /**
     * Execute a collaboration mode
     */
    async executeMode(mode, models, parameters, options = {}) {
        const handler = this.modes[mode.toLowerCase()];
        if (!handler) {
            throw new Error(`Unknown collaboration mode: ${mode}`);
        }

        console.log(`[ModeHandlers] Executing ${mode} mode with models: ${models.join(', ')}`);
        return await handler(models, parameters, options);
    }

    /**
     * Council Mode: All models vote on the best response
     */
    async councilMode(models, parameters, options = {}) {
        const responses = await this.executeAllModels(models, parameters);
        
        // Each model evaluates all responses and votes
        const evaluations = await this.evaluateResponses(models, responses, parameters);
        
        // Count votes and select winner
        const votes = this.countVotes(evaluations);
        const winner = this.selectWinner(votes);
        
        return {
            mode: 'council',
            winner: winner,
            responses: responses,
            evaluations: evaluations,
            votes: votes
        };
    }

    /**
     * Collaborate Mode: Models build upon each other's responses
     */
    async collaborateMode(models, parameters, options = {}) {
        const results = [];
        let currentContext = parameters;
        
        for (let i = 0; i < models.length; i++) {
            const model = models[i];
            const response = await this.taskMaster.executeTool(model, currentContext);
            results.push(response);
            
            // Update context for next model
            if (i < models.length - 1) {
                currentContext = this.updateContextForCollaboration(currentContext, response);
            }
        }
        
        return {
            mode: 'collaborate',
            results: results,
            finalResponse: results[results.length - 1]
        };
    }

    /**
     * Race Mode: First successful response wins
     */
    async raceMode(models, parameters, options = {}) {
        const promises = models.map(async (model) => {
            try {
                const response = await this.taskMaster.executeTool(model, parameters);
                return { model, response, success: true };
            } catch (error) {
                return { model, error: error.message, success: false };
            }
        });

        // Wait for first successful response
        const results = await Promise.allSettled(promises);
        const successful = results
            .map(r => r.value)
            .filter(r => r && r.success);

        if (successful.length === 0) {
            throw new Error('All models failed in race mode');
        }

        return {
            mode: 'race',
            winner: successful[0],
            allResults: results.map(r => r.value)
        };
    }

    /**
     * MetaJudge Mode: One model judges responses from others
     */
    async metaJudgeMode(models, parameters, options = {}) {
        if (models.length < 2) {
            throw new Error('MetaJudge mode requires at least 2 models');
        }

        const judgeModel = models[0];
        const contestants = models.slice(1);
        
        // Get responses from contestants
        const responses = await this.executeAllModels(contestants, parameters);
        
        // Judge evaluates all responses
        const judgmentPrompt = this.createJudgmentPrompt(parameters, responses);
        const judgment = await this.taskMaster.executeTool(judgeModel, {
            ...parameters,
            messages: [{ role: 'user', content: judgmentPrompt }]
        });
        
        return {
            mode: 'metajudge',
            judge: judgeModel,
            contestants: contestants,
            responses: responses,
            judgment: judgment
        };
    }

    /**
     * Discuss Mode: Models have a conversation
     */
    async discussMode(models, parameters, options = {}) {
        const maxRounds = options.maxRounds || 3;
        const discussion = [];
        let currentContext = parameters;
        
        for (let round = 0; round < maxRounds; round++) {
            const roundResponses = [];
            
            for (const model of models) {
                const response = await this.taskMaster.executeTool(model, currentContext);
                roundResponses.push({ model, response });
                
                // Update context with the conversation so far
                currentContext = this.updateContextForDiscussion(currentContext, roundResponses);
            }
            
            discussion.push({
                round: round + 1,
                responses: roundResponses
            });
        }
        
        return {
            mode: 'discuss',
            discussion: discussion,
            summary: this.summarizeDiscussion(discussion)
        };
    }

    /**
     * Fallback Mode: Try models in order until one succeeds
     */
    async fallbackMode(models, parameters, options = {}) {
        const attempts = [];
        
        for (const model of models) {
            try {
                const response = await this.taskMaster.executeTool(model, parameters);
                attempts.push({ model, response, success: true });
                
                return {
                    mode: 'fallback',
                    successfulModel: model,
                    response: response,
                    attempts: attempts
                };
            } catch (error) {
                attempts.push({ model, error: error.message, success: false });
                console.warn(`[ModeHandlers] Model ${model} failed, trying next...`);
            }
        }
        
        throw new Error('All models failed in fallback mode');
    }

    /**
     * Execute all models with the same parameters
     */
    async executeAllModels(models, parameters) {
        const promises = models.map(async (model) => {
            try {
                const response = await this.taskMaster.executeTool(model, parameters);
                return { model, response, success: true };
            } catch (error) {
                return { model, error: error.message, success: false };
            }
        });

        return await Promise.all(promises);
    }

    /**
     * Evaluate responses for council mode
     */
    async evaluateResponses(models, responses, originalParameters) {
        const evaluations = [];
        
        for (const evaluatorModel of models) {
            const evaluationPrompt = this.createEvaluationPrompt(originalParameters, responses);
            
            try {
                const evaluation = await this.taskMaster.executeTool(evaluatorModel, {
                    messages: [{ role: 'user', content: evaluationPrompt }],
                    temperature: 0.3
                });
                
                evaluations.push({
                    evaluator: evaluatorModel,
                    evaluation: evaluation
                });
            } catch (error) {
                console.warn(`[ModeHandlers] Evaluation by ${evaluatorModel} failed:`, error.message);
            }
        }
        
        return evaluations;
    }

    /**
     * Count votes from evaluations
     */
    countVotes(evaluations) {
        const votes = {};
        
        for (const evaluation of evaluations) {
            // Simple vote extraction - in practice, this would be more sophisticated
            const content = evaluation.evaluation.result?.choices?.[0]?.message?.content || '';
            const modelMentions = content.match(/\b(gpt-|claude-|llama-|model-)\w+/gi) || [];
            
            for (const mention of modelMentions) {
                votes[mention] = (votes[mention] || 0) + 1;
            }
        }
        
        return votes;
    }

    /**
     * Select winner based on votes
     */
    selectWinner(votes) {
        if (Object.keys(votes).length === 0) {
            return null;
        }
        
        return Object.entries(votes).reduce((a, b) => votes[a[0]] > votes[b[0]] ? a : b)[0];
    }

    /**
     * Update context for collaboration
     */
    updateContextForCollaboration(context, previousResponse) {
        const previousContent = previousResponse.result?.choices?.[0]?.message?.content || '';
        
        return {
            ...context,
            messages: [
                ...context.messages,
                { role: 'assistant', content: previousContent },
                { role: 'user', content: 'Please build upon and improve the previous response.' }
            ]
        };
    }

    /**
     * Update context for discussion
     */
    updateContextForDiscussion(context, roundResponses) {
        const conversationHistory = roundResponses.map(r => {
            const content = r.response.result?.choices?.[0]?.message?.content || '';
            return `${r.model}: ${content}`;
        }).join('\n\n');
        
        return {
            ...context,
            messages: [
                ...context.messages,
                { role: 'user', content: `Previous discussion:\n${conversationHistory}\n\nPlease continue the discussion.` }
            ]
        };
    }

    /**
     * Create evaluation prompt for council mode
     */
    createEvaluationPrompt(originalParameters, responses) {
        const originalQuery = originalParameters.messages?.[0]?.content || 'the query';
        const responseTexts = responses.map((r, i) => 
            `Response ${i + 1} (${r.model}): ${r.response?.result?.choices?.[0]?.message?.content || 'Error: ' + r.error}`
        ).join('\n\n');
        
        return `Please evaluate these responses to "${originalQuery}" and vote for the best one:

${responseTexts}

Which response is the most helpful, accurate, and well-reasoned? Please explain your choice and mention the specific model name.`;
    }

    /**
     * Create judgment prompt for metajudge mode
     */
    createJudgmentPrompt(originalParameters, responses) {
        const originalQuery = originalParameters.messages?.[0]?.content || 'the query';
        const responseTexts = responses.map((r, i) => 
            `Option ${i + 1}: ${r.response?.result?.choices?.[0]?.message?.content || 'Error: ' + r.error}`
        ).join('\n\n');
        
        return `As a judge, please evaluate these responses to "${originalQuery}" and provide your final judgment:

${responseTexts}

Please provide a detailed analysis and select the best response, explaining your reasoning.`;
    }

    /**
     * Summarize discussion for discuss mode
     */
    summarizeDiscussion(discussion) {
        const totalRounds = discussion.length;
        const participantModels = [...new Set(discussion.flatMap(d => d.responses.map(r => r.model)))];
        
        return {
            totalRounds,
            participantModels,
            keyPoints: this.extractKeyPoints(discussion),
            consensus: this.findConsensus(discussion)
        };
    }

    /**
     * Extract key points from discussion
     */
    extractKeyPoints(discussion) {
        // Simplified key point extraction
        return discussion.map((round, i) => `Round ${i + 1}: ${round.responses.length} responses`);
    }

    /**
     * Find consensus in discussion
     */
    findConsensus(discussion) {
        // Simplified consensus detection
        return 'Analysis of consensus would require more sophisticated NLP';
    }
}

module.exports = ModeHandlers;