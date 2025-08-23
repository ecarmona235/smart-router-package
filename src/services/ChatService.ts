import type { RouterClient } from '../client.js';
import { createProvider } from '../providers/factory.js';

// Import the actual model types from client
import type { LLMModelData, MediaModelData } from '../client.js';



// Chat response interface
export interface ChatResponse {
  success: boolean;
  data: string;
}

// Analysis result interface
export interface AnalysisResult {
  requestType: string;
  relevantMetrics: string[];
  priorityMetrics: string[];
  modelType: 'llm' | 'media';
  capability: 'text' | 'image' | 'audio' | 'video' | 'embedding';
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
  private client: RouterClient;

  // Circuit breaker tracking - maps model keys to health data
  private modelHealth: Map<string, {
    failures: number;
    lastFailure: number;
    disabledUntil?: number;
    disabledReason: 'TEMPORARY' | 'PERMANENT' | null;
  }> = new Map();

  constructor(client: RouterClient) {
    this.client = client;
    
    console.log('[ChatService] Initialized with smart model selection and LLM analysis');
  }

  /**
   * Analyze user request to determine relevant metrics and model type
   */
  private async analyzeRequest(userRequest: string): Promise<AnalysisResult> {
    try {
      // Get a suitable provider and API key from client configuration
      const { provider, apiKey, model } = this.getAnalysisProviderConfig();
      
      if (!provider || !apiKey) {
        throw new Error('No suitable analysis provider configured');
      }
      
      // Ensure provider name is valid for createProvider
      if (!this.isValidProviderName(provider)) {
        throw new Error(`Invalid provider name for analysis: ${provider}`);
      }
      
      const analysisProvider = createProvider(provider as any, apiKey);
      
      const prompt = this.buildAnalysisPrompt(userRequest);
      
      const response = await analysisProvider.sendMessage(model, prompt);
      
      if (!response.success) {
        throw new Error(`Analysis failed: ${response.error || 'Unknown error'}`);
      }
      
      if (!response.data) {
        throw new Error('Analysis response has no data');
      }
      
      return this.parseAnalysisResponse(response.data);
    } catch (error) {
      console.error('[ChatService] Error in request analysis:', error);
      // Fallback to basic analysis
      return this.fallbackAnalysis(userRequest);
    }
  }

  /**
   * Get analysis provider configuration from client
   */
  private getAnalysisProviderConfig(): { provider: string; apiKey: string; model: string } {
    // Get all configured providers from client
    const providers = this.client.getProviders();
    
    // Prefer OpenAI for analysis (good reasoning, cost-effective)
    if (providers.includes('openai')) {
      const config = this.client.getProviderConfig('openai');
      if (config) {
        return {
          provider: 'openai',
          apiKey: config.api_key,
          model: 'gpt-3.5-turbo' // Cost-effective for analysis
        };
      }
    }
    
    // Fallback to first available provider
    for (const providerName of providers) {
      const config = this.client.getProviderConfig(providerName);
      if (config) {
        // Use appropriate model for the provider
        const model = this.getDefaultModelForProvider(providerName);
        return {
          provider: providerName,
          apiKey: config.api_key,
          model
        };
      }
    }
    
    throw new Error('No providers configured with API keys');
  }

  /**
   * Get default model for provider (for analysis)
   */
  private getDefaultModelForProvider(providerName: string): string {
    switch (providerName) {
      case 'openai':
        return 'gpt-3.5-turbo';
      case 'anthropic':
        return 'claude-3-haiku-20240307'; // Cost-effective
      case 'cohere':
        return 'command-r-plus'; // Good reasoning
      case 'gemini':
        return 'gemini-1.5-flash'; // Cost-effective
      default:
        return 'gpt-3.5-turbo'; // Fallback
    }
  }

  /**
   * Check if provider name is valid for createProvider
   */
  private isValidProviderName(providerName: string): boolean {
    const validProviders = ['openai', 'xai', 'deepseek', 'meta-llama', 'meta-llama-groq', 'anthropic', 'cohere'];
    return validProviders.includes(providerName);
  }

  /**
   * Build prompt for LLM analysis
   */
  private buildAnalysisPrompt(userRequest: string): string {
    return `Analyze this user request and determine the best metrics and capability for model selection.

User Request: "${userRequest}"

Available Capabilities: text, image, audio, video, embedding
Available Metrics: ${EVALUATION_METRICS.join(', ')}

Please respond in this exact JSON format:
{
  "requestType": "brief description of request type (e.g., 'coding', 'creative writing', 'math problem')",
  "relevantMetrics": ["array", "of", "relevant", "metrics"],
  "priorityMetrics": ["array", "of", "priority", "metrics"],
  "modelType": "llm" or "media",
  "capability": "text" or "image" or "audio" or "video" or "embedding"
}

Focus on:
- What capability does the user actually need?
- Which metrics best evaluate that capability?
- Is this a text task or media generation task?`;
  }

  /**
   * Parse LLM analysis response
   */
  private parseAnalysisResponse(response: string): AnalysisResult {
    try {
      const parsed = JSON.parse(response);
      
      // Validate and sanitize the response
      const validMetrics = new Set(EVALUATION_METRICS);
      
      return {
        requestType: parsed.requestType || 'general',
        relevantMetrics: (parsed.relevantMetrics || [])
          .filter((metric: string) => validMetrics.has(metric as typeof EVALUATION_METRICS[number]))
          .slice(0, 4), // Max 4 metrics
        priorityMetrics: (parsed.priorityMetrics || [])
          .filter((metric: string) => validMetrics.has(metric as typeof EVALUATION_METRICS[number]))
          .slice(0, 2), // Max 2 priority metrics
        modelType: parsed.modelType === 'media' ? 'media' : 'llm',
        capability: parsed.capability || 'text',
      };
    } catch (error) {
      console.error('[ChatService] Error parsing analysis response:', error);
      return this.fallbackAnalysis('Failed to parse analysis');
    }
  }

  /**
   * Fallback analysis when LLM analysis fails
   */
  private fallbackAnalysis(userRequest: string): AnalysisResult {
    // Default to general metrics if analysis fails
    return {
      requestType: 'general',
      relevantMetrics: ['artificial_analysis_intelligence_index', 'artificial_analysis_coding_index'],
      priorityMetrics: ['artificial_analysis_intelligence_index'],
      modelType: 'llm',
      capability: 'text',
    };
  }



  /**
   * Main method to execute chat request
   */
  async execute(userRequest: string): Promise<ChatResponse> {
    try {
      // Phase 1: LLM analyzes user request to determine relevant metrics and model type
      const analysis = await this.analyzeRequest(userRequest);
      console.log(`[ChatService] LLM Analysis: ${analysis.requestType}, Metrics: ${analysis.relevantMetrics.join(', ')}, Model Type: ${analysis.modelType}`);
      
      // Phase 2: Filter models based on LLM analysis (relevant metrics + capability + API keys)
      const filteredModels = this.client.getFilteredModels(analysis.relevantMetrics, analysis.priorityMetrics, analysis.capability, 10);
      console.log(`[ChatService] Retrieved ${filteredModels.length} filtered models based on LLM analysis (capability: ${analysis.capability})`);
      
      // Phase 3: Execute with smart model selection and circuit breaker logic
      const response = await this.executeWithCircuitBreaker(filteredModels, userRequest, analysis);
      return response;
    } catch (error) {
      console.error('[ChatService] Error executing chat request:', error);
      return {
        success: false,
        data: 'Failed to process request'
      };
    }
  }

  /**
   * Execute user request with circuit breaker logic and smart model selection
   */
  private async executeWithCircuitBreaker(models: (LLMModelData | MediaModelData)[], userRequest: string, analysis: AnalysisResult): Promise<ChatResponse> {
    try {
      // Step 1: Use smart model selection with LLM assistance for 'middle' strategy
      const selectedModels = await this.selectModelsByStrategy(models, analysis);
      console.log(`[ChatService] Smart selection chose ${selectedModels.length} models for execution`);
      
      // Step 2: Execute with circuit breaker logic
      return await this.executeModelsInOrder(selectedModels, userRequest);
    } catch (error) {
      console.error('[ChatService] Error in circuit breaker execution:', error);
      // Fail fast - if selection/execution fails, there's a fundamental issue
      throw new Error(`Circuit breaker execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Select models based on user's configuration strategy
   */
  private async selectModelsByStrategy(models: (LLMModelData | MediaModelData)[], analysis: AnalysisResult): Promise<(LLMModelData | MediaModelData)[]> {
    const strategy = this.client.getSelectionStrategy();
    const isRotating = this.client.isRotatingEnabled();
    
    console.log(`[ChatService] Using selection strategy: ${strategy}, rotating: ${isRotating}`);
    
    let selectedModels: (LLMModelData | MediaModelData)[];
    
    switch (strategy) {
      case 'cheapest':
        selectedModels = this.selectCheapestModels(models, analysis);
        break;
      case 'accurate':
        selectedModels = this.selectMostAccurateModels(models, analysis);
        break;
      case 'middle':
      default:
        selectedModels = await this.selectBalancedModelsWithLLM(models, analysis);
        break;
    }
    
    // Apply rotation if enabled
    if (isRotating) {
      selectedModels = this.applyProviderRotation(selectedModels);
    }
    
    return selectedModels;
  }

  /**
   * Select cheapest models among those with LLM-selected metrics
   */
  private selectCheapestModels(models: (LLMModelData | MediaModelData)[], analysis: AnalysisResult): (LLMModelData | MediaModelData)[] {
    // Among models with LLM-selected metrics, pick the cheapest
    const relevantMetrics = analysis.relevantMetrics;
    
    console.log(`[ChatService] Selecting cheapest models among those with metrics: ${relevantMetrics.join(', ')}`);
    
    return models
      .filter(model => 'price' in model && model.price > 0) // Only models with price info
      .sort((a, b) => (a as any).price - (b as any).price) // Sort by price (lowest first)
      .slice(0, 5); // Return top 5 cheapest
  }

  /**
   * Select most accurate models based on LLM-selected metrics
   */
  private selectMostAccurateModels(models: (LLMModelData | MediaModelData)[], analysis: AnalysisResult): (LLMModelData | MediaModelData)[] {
    // Use the LLM-selected metrics to determine accuracy
    const relevantMetrics = analysis.relevantMetrics;
    
    console.log(`[ChatService] Selecting most accurate models using metrics: ${relevantMetrics.join(', ')}`);
    
    return models
      .sort((a, b) => {
        // Calculate score based on the specific metrics the LLM said are relevant
        const aScore = relevantMetrics.reduce((sum, metric) => 
          sum + (a.evaluations.get(metric) || 0), 0) / relevantMetrics.length;
        const bScore = relevantMetrics.reduce((sum, metric) => 
          sum + (b.evaluations.get(metric) || 0), 0) / relevantMetrics.length;
        
        console.log(`[ChatService] Model ${a.provider_name}:${a.name} score: ${aScore.toFixed(2)}, Model ${b.provider_name}:${b.name} score: ${bScore.toFixed(2)}`);
        
        return bScore - aScore; // Sort by accuracy (highest first)
      })
      .slice(0, 5); // Return top 5 most accurate
  }

  /**
   * Select balanced models (best accuracy/price ratio) using LLM-selected metrics
   */
  private selectBalancedModels(models: (LLMModelData | MediaModelData)[], analysis: AnalysisResult): (LLMModelData | MediaModelData)[] {
    const relevantMetrics = analysis.relevantMetrics;
    
    console.log(`[ChatService] Selecting balanced models using metrics: ${relevantMetrics.join(', ')}`);
    
    return models
      .filter(model => 'price' in model && model.price > 0) // Only models with price info
      .map(model => {
        // Calculate value score using only LLM-selected metrics
        const relevantScore = relevantMetrics.reduce((sum, metric) => 
          sum + (model.evaluations.get(metric) || 0), 0) / relevantMetrics.length;
        const valueScore = relevantScore / (model as any).price;
        return { model, valueScore, relevantScore };
      })
      .sort((a, b) => b.valueScore - a.valueScore) // Sort by highest value score
      .slice(0, 5) // Return top 5
      .map(item => {
        console.log(`[ChatService] Balanced model ${item.model.provider_name}:${item.model.name} - Score: ${item.relevantScore.toFixed(2)}, Price: ${(item.model as any).price}, Value: ${item.valueScore.toFixed(2)}`);
        return item.model;
      });
  }

  /**
   * Select balanced models using LLM assistance for optimal accuracy/price balance
   */
  private async selectBalancedModelsWithLLM(models: (LLMModelData | MediaModelData)[], analysis: AnalysisResult): Promise<(LLMModelData | MediaModelData)[]> {
    try {
      // Use LLM to analyze the models and find the best balance
      const { provider, apiKey, model } = this.getAnalysisProviderConfig();
      
      if (!provider || !apiKey) {
        console.warn('[ChatService] No analysis provider configured, falling back to automatic balance calculation');
        return this.selectBalancedModels(models, analysis);
      }
      
      // Ensure provider name is valid for createProvider
      if (!this.isValidProviderName(provider)) {
        console.warn(`[ChatService] Invalid provider name for analysis: ${provider}, falling back to automatic balance calculation`);
        return this.selectBalancedModels(models, analysis);
      }
      
      const analysisProvider = createProvider(provider as any, apiKey);
      
      const prompt = this.buildModelRankingPrompt(models, analysis);
      
      const response = await analysisProvider.sendMessage(model, prompt);
      
      if (!response.success || !response.data) {
        console.warn('[ChatService] LLM ranking failed, falling back to automatic balance calculation');
        return this.selectBalancedModels(models, analysis);
      }
      
      return this.parseModelRankingResponse(response.data, models, analysis);
    } catch (error) {
      console.error('[ChatService] Error in LLM-assisted model selection:', error);
      // Fallback to automatic balance calculation
      return this.selectBalancedModels(models, analysis);
    }
  }

  /**
   * Build prompt for LLM model ranking
   */
  private buildModelRankingPrompt(models: (LLMModelData | MediaModelData)[], analysis: AnalysisResult): string {
    const modelData = models.slice(0, 10).map(model => ({
      name: model.name,
      provider: model.provider_name,
      price: (model as any).price || 0,
      evaluations: Object.fromEntries(model.evaluations),
      type: 'price' in model && model.price ? 'LLM' : 'Media'
    }));

    return `You are an expert at selecting AI models. Analyze these models and rank them by the best balance of accuracy and cost-effectiveness.

User Request Analysis: ${analysis.requestType}
Relevant Metrics: ${analysis.relevantMetrics.join(', ')}
Priority Metrics: ${analysis.priorityMetrics.join(', ')}

Available Models:
${modelData.map((m, i) => `${i + 1}. ${m.provider}:${m.name} (${m.type}) - Price: ${m.price}, Evaluations: ${JSON.stringify(m.evaluations)}`).join('\n')}

Please rank the top 5 models by best accuracy/price balance. Consider:
- Higher evaluation scores are better
- Lower prices are better  
- Focus on the relevant metrics: ${analysis.relevantMetrics.join(', ')}

Respond with ONLY a JSON array of model names in order of preference:
["provider:model1", "provider:model2", "provider:model3", "provider:model4", "provider:model5"]`;
  }

  /**
   * Parse LLM model ranking response
   */
  private parseModelRankingResponse(response: string, models: (LLMModelData | MediaModelData)[], analysis: AnalysisResult): (LLMModelData | MediaModelData)[] {
    try {
      const rankedModelNames = JSON.parse(response);
      
      if (!Array.isArray(rankedModelNames)) {
        throw new Error('Invalid response format');
      }
      
      // Map ranked names back to actual model objects
      const rankedModels: (LLMModelData | MediaModelData)[] = [];
      
      for (const modelName of rankedModelNames) {
        const [provider, model] = modelName.split(':');
        const foundModel = models.find(m => m.provider_name === provider && m.name === model);
        if (foundModel) {
          rankedModels.push(foundModel);
        }
      }
      
      // If LLM ranking didn't return enough models, fill with remaining ones
      const remainingModels = models.filter(m => !rankedModels.includes(m));
      rankedModels.push(...remainingModels.slice(0, 5 - rankedModels.length));
      
      return rankedModels.slice(0, 5);
    } catch (error) {
      console.error('[ChatService] Error parsing model ranking response:', error);
      // Fallback to automatic balance calculation
      return this.selectBalancedModels(models, analysis);
    }
  }

  /**
   * Apply provider rotation to distribute API usage based on last_used timestamps
   */
  private applyProviderRotation(models: (LLMModelData | MediaModelData)[]): (LLMModelData | MediaModelData)[] {
    // Group models by provider
    const providerGroups = new Map<string, (LLMModelData | MediaModelData)[]>();
    
    for (const model of models) {
      const provider = model.provider_name;
      if (!providerGroups.has(provider)) {
        providerGroups.set(provider, []);
      }
      providerGroups.get(provider)!.push(model);
    }
    
    // Get provider last_used timestamps for rotation
    const providersWithUsage: Array<{
      providerName: string;
      models: (LLMModelData | MediaModelData)[];
      lastUsed: number;
    }> = [];
    
    for (const [providerName, models] of providerGroups) {
      // Check LLM providers first
      let lastUsed = 0; // Default to epoch if never used
      
      const llmProvider = this.client.getLLMProviders().get(providerName);
      const mediaProvider = this.client.getMediaProviders().get(providerName);
      
      if (llmProvider?.last_used) {
        lastUsed = llmProvider.last_used.getTime();
      } else if (mediaProvider?.last_used) {
        lastUsed = mediaProvider.last_used.getTime();
      }
      
      providersWithUsage.push({
        providerName,
        models,
        lastUsed
      });
    }
    
    // Sort providers by last_used (oldest first for rotation)
    providersWithUsage.sort((a, b) => a.lastUsed - b.lastUsed);
    
    // Build rotated models list, prioritizing least recently used providers
    const rotatedModels: (LLMModelData | MediaModelData)[] = [];
    
    // Take models from each provider in rotation order (oldest first)
    let maxModelsPerProvider = Math.max(...providersWithUsage.map(p => p.models.length));
    
    for (let i = 0; i < maxModelsPerProvider; i++) {
      for (const providerData of providersWithUsage) {
        if (i < providerData.models.length && providerData.models[i]) {
          rotatedModels.push(providerData.models[i]!);
        }
      }
    }
    
    console.log(`[ChatService] Provider rotation applied. Order: ${providersWithUsage.map(p => 
      `${p.providerName}(${p.lastUsed ? new Date(p.lastUsed).toISOString() : 'never'})`
    ).join(' → ')}`);
    
    return rotatedModels.slice(0, 10); // Return max 10 models
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
          
          // Update provider usage for rotation (only when rotating is enabled)
          if (this.client.isRotatingEnabled()) {
            this.updateProviderUsage(model.provider_name);
          }
          
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
      data: 'All available models failed to execute the request'
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
   * Update provider usage timestamp for rotation
   */
  private updateProviderUsage(providerName: string): void {
    // Delegate to ProviderManagementService through RouterClient
    // We need to call this through the client since ChatService doesn't have direct access to providers
    console.log(`[ChatService] Updating provider usage for rotation: ${providerName}`);
    
    // Update LLM provider if it exists
    const llmProvider = this.client.getLLMProviders().get(providerName);
    if (llmProvider) {
      llmProvider.last_used = new Date();
    }
    
    // Update Media provider if it exists
    const mediaProvider = this.client.getMediaProviders().get(providerName);
    if (mediaProvider) {
      mediaProvider.last_used = new Date();
    }
  }

  /**
   * Get current circuit breaker status for debugging
   */
  getCircuitBreakerStatus(): Map<string, any> {
    return new Map(this.modelHealth);
  }
}
