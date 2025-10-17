/**
 * Comprehensive test configuration for TaskMaster testing
 * This file provides test providers, scenarios, mock responses, and environment setup
 */

const testConfig = {
  // Test providers configuration with multiple providers and models
  providers: [
    {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      models: [
        {
          name: 'gpt-4',
          capabilities: ['text-generation'],
          contextWindow: 8192,
          maxTokens: 4096
        },
        {
          name: 'gpt-3.5-turbo',
          capabilities: ['text-generation'],
          contextWindow: 4096,
          maxTokens: 2048
        },
        {
          name: 'text-embedding-ada-002',
          capabilities: ['embeddings'],
          dimensions: 1536
        },
        {
          name: 'dall-e-3',
          capabilities: ['image-generation'],
          sizes: ['1024x1024', '1792x1024', '1024x1792']
        }
      ],
      priority: 1,
      rateLimit: {
        requests: 100,
        period: '1m',
        burst: 10
      },
      retryConfig: {
        maxRetries: 3,
        backoffMultiplier: 2
      }
    },
    {
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      models: [
        {
          name: 'claude-3-opus-20240229',
          capabilities: ['text-generation'],
          contextWindow: 200000,
          maxTokens: 4096
        },
        {
          name: 'claude-3-sonnet-20240229',
          capabilities: ['text-generation'],
          contextWindow: 200000,
          maxTokens: 4096
        },
        {
          name: 'claude-3-haiku-20240307',
          capabilities: ['text-generation'],
          contextWindow: 200000,
          maxTokens: 4096
        }
      ],
      priority: 2,
      rateLimit: {
        requests: 50,
        period: '1m',
        burst: 5
      },
      retryConfig: {
        maxRetries: 3,
        backoffMultiplier: 1.5
      }
    },
    {
      name: 'Google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      models: [
        {
          name: 'gemini-pro',
          capabilities: ['text-generation'],
          contextWindow: 32768,
          maxTokens: 8192
        },
        {
          name: 'gemini-pro-vision',
          capabilities: ['text-generation', 'image-understanding'],
          contextWindow: 16384,
          maxTokens: 4096
        },
        {
          name: 'textembedding-gecko',
          capabilities: ['embeddings'],
          dimensions: 768
        }
      ],
      priority: 3,
      rateLimit: {
        requests: 60,
        period: '1m',
        burst: 15
      },
      retryConfig: {
        maxRetries: 2,
        backoffMultiplier: 2
      }
    },
    {
      name: 'StabilityAI',
      baseUrl: 'https://api.stability.ai/v1',
      models: [
        {
          name: 'stable-diffusion-xl-1024-v1-0',
          capabilities: ['image-generation'],
          sizes: ['1024x1024', '1152x896', '896x1152', '768x768']
        },
        {
          name: 'stable-diffusion-v1-6',
          capabilities: ['image-generation'],
          sizes: ['512x512', '768x768']
        }
      ],
      priority: 4,
      rateLimit: {
        requests: 150,
        period: '1m',
        burst: 10
      },
      retryConfig: {
        maxRetries: 3,
        backoffMultiplier: 1.8
      }
    },
    {
      name: 'Cohere',
      baseUrl: 'https://api.cohere.ai/v1',
      models: [
        {
          name: 'command',
          capabilities: ['text-generation'],
          contextWindow: 4096,
          maxTokens: 2048
        },
        {
          name: 'embed-english-v3.0',
          capabilities: ['embeddings'],
          dimensions: 1024
        }
      ],
      priority: 5,
      rateLimit: {
        requests: 100,
        period: '1m',
        burst: 20
      },
      retryConfig: {
        maxRetries: 2,
        backoffMultiplier: 2
      }
    }
  ],

  // Test scenarios for different prompt types that trigger subtask decomposition
  testScenarios: {
    // Simple prompts that don't require decomposition
    simple: {
      greeting: 'Hello, how are you?',
      question: 'What is the capital of France?',
      statement: 'The weather is nice today.'
    },

    // Complex prompts that should trigger subtask decomposition
    complex: {
      multiStepTask: 'Plan a complete software development project: 1. Requirements gathering 2. Design architecture 3. Implementation 4. Testing 5. Deployment',
      creativeWriting: 'Write a short story about artificial intelligence becoming self-aware, including plot development, character arcs, and a surprising twist',
      researchTask: 'Research and summarize the impact of climate change on global agriculture, including statistics, affected regions, and potential solutions',
      analysisTask: 'Analyze the financial performance of a tech startup: review revenue streams, cost structure, market positioning, and provide growth recommendations',
      eventPlanning: 'Organize a corporate conference: venue selection, speaker lineup, marketing strategy, logistics coordination, and budget management'
    },

    // Prompts specifically designed to test subtask decomposition logic
    decomposition: {
      numberedList: 'Create a meal plan for a week: 1. Breakfast options 2. Lunch recipes 3. Dinner ideas 4. Snack suggestions 5. Grocery list',
      sequentialProcess: 'Build a website from scratch: setup development environment, design UI/UX, implement frontend, create backend API, deploy to production',
      parallelTasks: 'Launch a new product: market research, prototype development, user testing, marketing campaign, sales strategy',
      conditionalLogic: 'Troubleshoot a computer problem: check hardware connections, run diagnostics, update drivers, reinstall software if needed',
      iterativeProcess: 'Write a research paper: topic selection, literature review, methodology design, data collection, analysis, conclusion writing'
    },

    // Edge cases for testing
    edgeCases: {
      emptyPrompt: '',
      veryLongPrompt: 'A'.repeat(10000),
      specialCharacters: '!@#$%^&*()_+-=[]{}|;:,.<>?',
      multilingual: 'こんにちは、世界！ Hello world! Hola mundo!',
      codeSnippet: 'Write a function in JavaScript that sorts an array using bubble sort algorithm'
    }
  },

  // Mock API responses for testing different scenarios
  mockResponses: {
    // Successful responses
    success: {
      openai: {
        status: 200,
        data: {
          choices: [{
            message: {
              content: 'This is a mock response from OpenAI GPT-4'
            }
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          }
        }
      },
      anthropic: {
        status: 200,
        data: {
          content: [{
            text: 'This is a mock response from Anthropic Claude'
          }],
          usage: {
            input_tokens: 15,
            output_tokens: 25
          }
        }
      },
      embeddings: {
        status: 200,
        data: {
          data: [{
            embedding: Array.from({length: 1536}, () => Math.random())
          }],
          usage: {
            prompt_tokens: 5,
            total_tokens: 5
          }
        }
      },
      imageGeneration: {
        status: 200,
        data: {
          data: [{
            url: 'https://example.com/generated-image.png',
            revised_prompt: 'A beautiful landscape with mountains and lakes'
          }]
        }
      }
    },

    // Error responses
    errors: {
      rateLimit: {
        status: 429,
        data: {
          error: {
            type: 'rate_limit_exceeded',
            message: 'Rate limit exceeded. Please try again later.'
          }
        }
      },
      authentication: {
        status: 401,
        data: {
          error: {
            type: 'authentication_error',
            message: 'Invalid API key provided.'
          }
        }
      },
      serverError: {
        status: 500,
        data: {
          error: {
            type: 'internal_server_error',
            message: 'The server encountered an internal error.'
          }
        }
      },
      modelNotFound: {
        status: 404,
        data: {
          error: {
            type: 'model_not_found',
            message: 'The requested model does not exist.'
          }
        }
      },
      timeout: {
        status: 408,
        data: {
          error: {
            type: 'timeout_error',
            message: 'Request timed out.'
          }
        }
      }
    },

    // Network-related responses
    network: {
      connectionRefused: {
        status: null,
        error: 'ECONNREFUSED',
        message: 'Connection refused'
      },
      timeout: {
        status: null,
        error: 'ETIMEDOUT',
        message: 'Connection timed out'
      },
      dnsFailure: {
        status: null,
        error: 'ENOTFOUND',
        message: 'DNS lookup failed'
      }
    }
  },

  // Test environment variables for secure testing
  environment: {
    // API Keys (use test/mock keys for testing)
    OPENAI_API_KEY: 'sk-test-openai-key-1234567890abcdef',
    ANTHROPIC_API_KEY: 'sk-ant-test-anthropic-key-1234567890abcdef',
    GOOGLE_API_KEY: 'AIzaSyTestGoogleKey1234567890abcdef',
    STABILITY_API_KEY: 'sk-test-stability-key-1234567890abcdef',
    COHERE_API_KEY: 'test-cohere-key-1234567890abcdef',

    // Test configuration
    NODE_ENV: 'test',
    TEST_MODE: 'true',
    LOG_LEVEL: 'debug',

    // Database configuration (use test database)
    DATABASE_URL: 'postgresql://testuser:testpass@localhost:5432/taskmaster_test',

    // Redis configuration (use test instance)
    REDIS_URL: 'redis://localhost:6379/1',

    // Security settings
    JWT_SECRET: 'test-jwt-secret-key-for-testing-only',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-long',

    // Rate limiting
    RATE_LIMIT_REQUESTS: '100',
    RATE_LIMIT_WINDOW: '60000', // 1 minute in ms

    // Timeout settings
    REQUEST_TIMEOUT: '30000', // 30 seconds
    CONNECTION_TIMEOUT: '10000', // 10 seconds

    // Feature flags
    ENABLE_CACHING: 'true',
    ENABLE_METRICS: 'true',
    ENABLE_LOGGING: 'true',

    // External service URLs (use mock/test endpoints)
    METRICS_ENDPOINT: 'http://localhost:9090/metrics',
    LOGGING_ENDPOINT: 'http://localhost:8080/logs'
  },

  // Test utilities and helpers
  testUtils: {
    // Timeout configurations for different test types
    timeouts: {
      unit: 5000,      // 5 seconds
      integration: 30000, // 30 seconds
      e2e: 120000     // 2 minutes
    },

    // Retry configurations for flaky tests
    retries: {
      flakyTests: 3,
      networkTests: 5
    },

    // Test data generators
    generators: {
      randomPrompt: () => `Test prompt ${Math.random().toString(36).substring(7)}`,
      randomModel: () => ['gpt-4', 'claude-3-opus-20240229', 'gemini-pro'][Math.floor(Math.random() * 3)],
      randomProvider: () => ['OpenAI', 'Anthropic', 'Google'][Math.floor(Math.random() * 3)]
    }
  }
};

module.exports = testConfig;