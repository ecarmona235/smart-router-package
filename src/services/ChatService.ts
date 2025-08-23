import type { RouterClient } from '../client.js';
import { createProvider } from '../providers/factory.js';

// Import the actual model types from client
import type { LLMModelData, MediaModelData } from '../client.js';

// Analysis result interface
export interface AnalysisResult {
  relevantMetrics: string[];
  priorityMetrics: string[];
  detailedReasoning?: string;
}

// Chat response interface
export interface ChatResponse {
  success: boolean;
  data: string;
  reasoning?: string | undefined;
}

// Available evaluation metrics
const EVALUATION_METRICS = [
  'artificial_analysis_intelligence_index',
  'artificial_analysis_coding_index',
  'artificial_analysis_math_index',
  'mmlu_pro_index',
  'physics_knowledge_index',
  'human_level_evaluation_index',
  'live_code_benchmark_index',
  'science_code_benchmark_index',
  'math_benchmark_index',
  'aime_index',
  'aime_25_index',
  'image_benchmark_index'
] as const;

export class ChatService {
  private analysisProvider: any; // OpenAI provider for analysis
  private client: RouterClient;

  // Circuit breaker tracking - maps model keys to health data
  private modelHealth: Map<string, {
    failures: number;
    lastFailure: number;
    disabledUntil?: number;
    disabledReason: 'TEMPORARY' | 'PERMANENT' | null;
  }> = new Map();

  constructor(
    client: RouterClient, 
    analysisConfig?: {
      provider: string;
      model: string;
    }
  ) {
    this.client = client;
    
    // Use provided analysis config or fall back to defaults
    if (analysisConfig) {
      // Use user-specified provider and model
      this.analysisProvider = createProvider(
        analysisConfig.provider as any, 
        this.getProviderAPIKey(analysisConfig.provider)
      );
      console.log(`[ChatService] Using custom analysis provider: ${analysisConfig.provider} with model: ${analysisConfig.model}`);
    } else {
      // Use default: OpenAI GPT-3.5-turbo for cost-effective analysis
      this.analysisProvider = createProvider('openai', this.getProviderAPIKey('openai'));
      console.log('[ChatService] Using default analysis provider: OpenAI GPT-3.5-turbo');
    }
    
    // Store the model to use for analysis
    this.analysisModel = analysisConfig?.model || 'gpt-3.5-turbo';
  }

  private analysisModel: string;

  /**
   * Get API key for a specific provider from client configuration
   */
  private getProviderAPIKey(providerName: string): string {
    const provider = this.client.getProviders().find(p => p === providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' not configured in client. Please add it using addProvider() method.`);
    }
    
    // Get the API key from client's provider configuration
    const providerConfig = this.client.getProviderConfig(providerName);
    if (!providerConfig || !providerConfig.api_key) {
      throw new Error(`No API key found for provider '${providerName}'. Please configure it using addProvider() method.`);
    }
    
    return providerConfig.api_key;
  }

  /**
   * Update the analysis provider configuration
   * @param config - New configuration for the analysis provider
   *   - provider: Provider name (e.g., 'openai', 'anthropic', 'cohere')
   *   - model: Model name to use for analysis (e.g., 'gpt-3.5-turbo', 'claude-3-haiku')
   * 
   * Note: Uses API keys already configured in the client via addProvider() method
   */
  updateAnalysisProvider(config: {
    provider: string;
    model: string;
  }): void {
    this.analysisProvider = createProvider(
      config.provider as any,
      this.getProviderAPIKey(config.provider)
    );
    this.analysisModel = config.model;
    console.log(`[ChatService] Updated analysis provider: ${config.provider} with model: ${config.model}`);
  }

  /**
   * Main method to execute chat request
   */
  async execute(userRequest: string): Promise<ChatResponse> {
    try {
      // Phase 1: Analyze request to determine relevant metrics
      const analysis = await this.analyzeRequest(userRequest, this.client.isReasoningEnabled());
      
      // Phase 2: Get filtered models from client based on analysis
      const filteredModels = this.client.getFilteredModels(analysis.relevantMetrics, analysis.priorityMetrics, 10);
      console.log(`[ChatService] Retrieved ${filteredModels.length} filtered models for execution`);
      
      // Phase 3: Execute with circuit breaker logic (LLM will rank models during execution)
      const response = await this.executeWithCircuitBreaker(filteredModels, userRequest);
      return response;
    } catch (error) {
      console.error('[ChatService] Error executing chat request:', error);
      return {
        success: false,
        data: 'Failed to process request',
        reasoning: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute user request with circuit breaker logic and LLM model ranking
   */
  private async executeWithCircuitBreaker(models: (LLMModelData | MediaModelData)[], userRequest: string): Promise<ChatResponse> {
    try {
      // Step 1: LLM ranks models based on user hierarchy
      const rankedModels = await this.rankModelsWithLLM(models);
      console.log(`[ChatService] LLM ranked ${rankedModels.length} models for execution`);
      
      // Step 2: Execute with circuit breaker logic
      return await this.executeModelsInOrder(rankedModels, userRequest);
    } catch (error) {
      console.error('[ChatService] Error in circuit breaker execution:', error);
      // Fail fast - if ranking/execution fails, there's a fundamental issue
      throw new Error(`Circuit breaker execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Use LLM to intelligently rank models based on user hierarchy preferences
   */
  private async rankModelsWithLLM(models: (LLMModelData | MediaModelData)[]): Promise<(LLMModelData | MediaModelData)[]> {
    try {
      const prompt = this.buildModelRankingPrompt(models);
      const response = await this.analysisProvider.sendMessage(this.analysisModel, prompt);
      
      if (!response.success) {
        throw new Error(`LLM ranking failed: ${response.error}`);
      }

      const rankedModels = this.parseModelRankingResponse(response.data, models);
      console.log(`[ChatService] Successfully ranked ${rankedModels.length} models using LLM`);
      return rankedModels;
    } catch (error) {
      console.error('[ChatService] Error in LLM ranking, using original order:', error);
      return models; // Return original order if ranking fails
    }
  }

  /**
   * Build prompt for LLM to rank models
   */
  private buildModelRankingPrompt(models: (LLMModelData | MediaModelData)[]): string {
    const modelDetails = models.map((model, index) => {
      const modelType = 'price_per_1M_input_tokens' in model ? 'LLM' : 'Media';
      const metrics = Array.from(model.evaluations.entries())
        .filter((entry) => {
          const [_, value] = entry as [any, any];
          return value !== null && value !== undefined;
        })
        .map((entry) => {
          const [metric, value] = entry as [any, any];
          return `${metric}: ${value}`;
        })
        .join(', ');
      
      return `${index + 1}. ${model.provider_name}:${model.name} (${modelType})
   - Price: ${model.price}
   - Latency: ${model.latency}
   - Metrics: ${metrics || 'None'}
   - Last Used: ${model.last_used ? model.last_used.toISOString() : 'Never'}`;
    }).join('\n\n');

    return `You are an AI model selector. Rank the following models based on the user's hierarchy preferences.

User Hierarchy: ${this.client.getHierarchy().first} → ${this.client.getHierarchy().second} → ${this.client.getHierarchy().third} → ${this.client.getHierarchy().last}

Available Models:
${modelDetails}

Instructions:
- Consider the user's hierarchy preferences when ranking
- Make intelligent trade-offs (e.g., 95% accuracy + $1 might be better than 99% accuracy + $1000)
- Balance all factors according to user preferences
- Return ONLY the model numbers in ranked order (e.g., "3, 1, 4, 2")

Ranked Models (numbers only):`;
  }

  /**
   * Parse LLM response to get ranked model list
   */
  private parseModelRankingResponse(response: string, originalModels: (LLMModelData | MediaModelData)[]): (LLMModelData | MediaModelData)[] {
    try {
      // Extract numbers from response
      const numberMatch = response.match(/\d+(?:\s*,\s*\d+)*/);
      if (!numberMatch) {
        throw new Error('No ranking numbers found in response');
      }

      const rankedIndices = numberMatch[0].split(',').map(s => parseInt(s.trim()) - 1); // Convert to 0-based indices
      
      // Validate indices
      const validIndices = rankedIndices.filter(index => index >= 0 && index < originalModels.length);
      
      if (validIndices.length === 0) {
        throw new Error('No valid model indices found');
      }

      // Build ranked model list
      const rankedModels: (LLMModelData | MediaModelData)[] = [];
      const usedIndices = new Set<number>();

      for (const index of validIndices) {
        if (!usedIndices.has(index) && originalModels[index]) {
          rankedModels.push(originalModels[index]!);
          usedIndices.add(index);
        }
      }

      // Add any remaining models that weren't ranked
      for (let i = 0; i < originalModels.length; i++) {
        if (!usedIndices.has(i) && originalModels[i]) {
          rankedModels.push(originalModels[i]!);
        }
      }

      console.log(`[ChatService] LLM ranked ${rankedModels.length} models successfully`);
      return rankedModels;
    } catch (error) {
      console.error('[ChatService] Error parsing LLM ranking response:', error);
      return originalModels; // Return original order if parsing fails
    }
  }

  /**
   * Analyze user request to determine relevant evaluation metrics
   */
  private async analyzeRequest(userRequest: string, enableReasoning: boolean = false): Promise<AnalysisResult> {
    try {
      const prompt = this.buildAnalysisPrompt(userRequest, enableReasoning);
      
      const response = await this.analysisProvider.sendMessage(this.analysisModel, prompt);
      
      if (!response.success) {
        throw new Error(`Analysis failed: ${response.error}`);
      }

      // Parse the response
      const result = this.parseAnalysisResponse(response.data, enableReasoning);
      
      console.log(`[ChatService] Request analysis complete. Relevant metrics: ${result.relevantMetrics.length}, Priority metrics: ${result.priorityMetrics.length}`);
      
      return result;
    } catch (error) {
      console.error('[ChatService] Error analyzing request:', error);
      // Fallback to basic analysis
      return this.fallbackAnalysis(userRequest);
    }
  }

  /**
   * Build the analysis prompt for the LLM
   */
  private buildAnalysisPrompt(userRequest: string, enableReasoning: boolean): string {
    const basePrompt = `Analyze this user request and select the most relevant evaluation metrics from this list:

${EVALUATION_METRICS.map(metric => `- ${metric}`).join('\n')}

User request: "${userRequest}"

${enableReasoning ? 
  'Provide a detailed analysis explaining why these metrics are relevant and how they should be prioritized.' :
  'Select the most relevant metrics for this request.'
}

Output format (JSON only):
{
  "relevantMetrics": ["metric1", "metric2", "metric3"],
  "priorityMetrics": ["metric1", "metric2"],
  ${enableReasoning ? '"detailedReasoning": "explanation here"' : ''}
}

Choose 3-5 relevant metrics and 2-3 priority metrics. Be specific and thoughtful in your selection.`;

    return basePrompt;
  }

  /**
   * Parse the LLM response into structured data
   */
  private parseAnalysisResponse(response: string, enableReasoning: boolean): AnalysisResult {
    try {
      // Extract JSON from response (handle cases where LLM adds extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!Array.isArray(parsed.relevantMetrics) || !Array.isArray(parsed.priorityMetrics)) {
        throw new Error('Invalid response format');
      }

      // Validate that metrics exist in our list
      const validMetrics = new Set(EVALUATION_METRICS);
      const relevantMetrics = parsed.relevantMetrics.filter((metric: string) => 
        validMetrics.has(metric as typeof EVALUATION_METRICS[number])
      );
      const priorityMetrics = parsed.priorityMetrics.filter((metric: string) => 
        validMetrics.has(metric as typeof EVALUATION_METRICS[number])
      );

      return {
        relevantMetrics,
        priorityMetrics,
        detailedReasoning: enableReasoning ? parsed.detailedReasoning : undefined
      };
    } catch (error) {
      console.error('[ChatService] Error parsing analysis response:', error);
      throw new Error(`Failed to parse analysis response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fallback analysis when LLM analysis fails
   */
  private fallbackAnalysis(userRequest: string): AnalysisResult {
    console.log('[ChatService] Using fallback analysis');
    
    // Simple keyword-based fallback
    const requestLower = userRequest.toLowerCase();
    
    let relevantMetrics: string[] = ['artificial_analysis_intelligence_index']; // Default
    
    if (requestLower.includes('code') || requestLower.includes('programming') || requestLower.includes('coding')) {
      relevantMetrics.push('artificial_analysis_coding_index', 'live_code_benchmark_index');
    }
    
    if (requestLower.includes('math') || requestLower.includes('calculation') || requestLower.includes('equation')) {
      relevantMetrics.push('artificial_analysis_math_index', 'math_benchmark_index', 'aime_index');
    }
    
    if (requestLower.includes('science') || requestLower.includes('physics') || requestLower.includes('chemistry')) {
      relevantMetrics.push('physics_knowledge_index', 'science_code_benchmark_index');
    }
    
    if (requestLower.includes('image') || requestLower.includes('vision') || requestLower.includes('picture')) {
      relevantMetrics.push('image_benchmark_index');
    }

    return {
      relevantMetrics,
      priorityMetrics: relevantMetrics.slice(0, 2) // Top 2 as priority
    };
  }

  /**
   * Execute models in order with circuit breaker logic
   */
  private async executeModelsInOrder(models: (LLMModelData | MediaModelData)[], userRequest: string): Promise<ChatResponse> {
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      if (!model) continue; // Skip undefined models
      
      const modelType = 'price_per_1M_input_tokens' in model ? 'LLM' : 'Media';
      
      try {
        console.log(`[ChatService] Trying model ${i + 1}/${models.length}: ${model.provider_name}:${model.name} (${modelType})`);
        
        if (modelType === 'Media') {
          // Log media model execution attempt (feature not implemented)
          console.log(`[ChatService] Would execute media model ${model.provider_name}:${model.name} (feature not implemented)`);
          continue; // Skip to next model
        }
        
        // Execute LLM model (we know it's LLM at this point)
        const response = await this.executeLLMModel(model as LLMModelData, userRequest);
        if (response.success) {
          console.log(`[ChatService] Successfully executed ${model.provider_name}:${model.name}`);
          // Reset failure count on success
          this.resetModelFailures(model);
          return response;
        }
        
        // If we get here, the model failed but didn't throw an error
        console.log(`[ChatService] Model ${model.provider_name}:${model.name} failed without error`);
        
      } catch (error) {
        console.error(`[ChatService] Error executing ${model.provider_name}:${model.name}:`, error);
        // Implement circuit breaker logic
        this.recordModelFailure(model, error);
        
        // Check if model should be disabled
        if (this.isModelDisabled(model)) {
          console.log(`[ChatService] Model ${model.provider_name}:${model.name} is disabled, skipping`);
          continue;
        }
      }
    }
    
    // All models failed
    return {
      success: false,
      data: 'All available models failed to execute the request',
      reasoning: 'Circuit breaker: All models exhausted'
    };
  }

  /**
   * Execute a single LLM model
   */
  private async executeLLMModel(model: LLMModelData, userRequest: string): Promise<ChatResponse> {
    try {
      // Create provider for this model
      const provider = createProvider(model.provider_name as any, this.client.getProviderConfig(model.provider_name)?.api_key || '');
      
      // Send the request
      const response = await provider.sendMessage(model.name, userRequest);
      
      if (response.success) {
        return {
          success: true,
          data: response.data || '',
          reasoning: `Executed by ${model.provider_name}:${model.name}`
        };
      } else {
        throw new Error(response.error || 'Unknown provider error');
      }
    } catch (error) {
      throw error; // Re-throw to be handled by circuit breaker
    }
  }

  /**
   * Record a model failure in the circuit breaker
   */
  private recordModelFailure(model: LLMModelData | MediaModelData, error: any): void {
    const modelKey = `${model.provider_name}:${model.name}`;
    const currentHealth = this.modelHealth.get(modelKey) || {
      failures: 0,
      lastFailure: Date.now(),
      disabledReason: null,
    };

    // Increment failure count
    currentHealth.failures++;
    currentHealth.lastFailure = Date.now();

    // Classify error and set disable reason
    const errorType = this.classifyError(error);
    
    if (errorType === 'PERMANENT') {
      currentHealth.disabledReason = 'PERMANENT';
      console.log(`[ChatService] Model ${modelKey} disabled permanently due to ${currentHealth.failures} consecutive failures.`);
    } else if (currentHealth.failures >= 3) {
      // Temporary disable for 15 minutes after 3 failures
      currentHealth.disabledReason = 'TEMPORARY';
      currentHealth.disabledUntil = Date.now() + (15 * 60 * 1000); // 15 minutes
      console.log(`[ChatService] Model ${modelKey} disabled temporarily for 15 minutes due to ${currentHealth.failures} consecutive failures.`);
    }

    this.modelHealth.set(modelKey, currentHealth);
  }

  /**
   * Reset model failures for a specific model
   */
  private resetModelFailures(model: LLMModelData | MediaModelData): void {
    const modelKey = `${model.provider_name}:${model.name}`;
    const currentHealth = this.modelHealth.get(modelKey);

    if (currentHealth) {
      currentHealth.failures = 0;
      currentHealth.lastFailure = Date.now();
      currentHealth.disabledReason = null;
      delete currentHealth.disabledUntil;
      console.log(`[ChatService] Model ${modelKey} failures reset to zero.`);
    }
  }

  /**
   * Check if a model is currently disabled
   */
  private isModelDisabled(model: LLMModelData | MediaModelData): boolean {
    const modelKey = `${model.provider_name}:${model.name}`;
    const currentHealth = this.modelHealth.get(modelKey);

    if (!currentHealth) {
      return false; // Should not happen if recordModelFailure is called
    }

    if (currentHealth.disabledReason === 'PERMANENT') {
      return true;
    }

    if (currentHealth.disabledReason === 'TEMPORARY' && currentHealth.disabledUntil) {
      const now = Date.now();
      if (now < currentHealth.disabledUntil) {
        return true;
      }
    }

    return false;
  }

  /**
   * Classify error as permanent or temporary
   */
  private classifyError(error: any): 'TEMPORARY' | 'PERMANENT' {
    const errorMessage = error?.message?.toLowerCase() || '';
    const statusCode = error?.status || error?.statusCode;

    // Permanent errors (API key issues)
    if (statusCode >= 400 && statusCode <= 403) return 'PERMANENT';
    if (errorMessage.includes('permission_denied') || 
        errorMessage.includes('access_denied') ||
        errorMessage.includes('insufficient_quota') ||
        errorMessage.includes('authentication_error') ||
        errorMessage.includes('auth_error') ||
        errorMessage.includes('model_not_found') ||
        errorMessage.includes('billing_required')) {
      return 'PERMANENT';
    }

    // Temporary errors (service issues)
    return 'TEMPORARY';
  }

  /**
   * Get current circuit breaker status for debugging
   */
  getCircuitBreakerStatus(): Map<string, any> {
    return new Map(this.modelHealth);
  }
}
