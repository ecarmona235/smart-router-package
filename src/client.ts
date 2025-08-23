import { ChatService } from './services/ChatService.js';
import { DataManagementService } from './services/DataManagementService.js';
import { ProviderManagementService } from './services/ProviderManagementService.js';
import { FuzzyMatchingService } from './services/FuzzyMatchingService.js';
import { ConfigurationService } from './services/ConfigurationService.js';

export type RouterClientOptions = {
    AI_ANALYSIS_API?: string;
    fetchFn?: typeof fetch;
    maxAge?: number; // in hours, default 168 (1 week)
    modelSelection?: {
        cheapest?: boolean;
        accurate?: boolean;
        middle?: boolean;
        rotating?: boolean;
    };
    providers?: Array<{
        provider_name: string;
        api_key: string;
    }>;
    stale_clean_up?: boolean; // true by default, removes stale unused models
};

// Provider-level interface
interface ProviderData {
  has_api_key: boolean;
  models: Map<string, ModelData>;
  last_used: Date | null; // Track when this provider was last used (for rotation)
}

// Base model interface
interface ModelData {
  name: string; // Model name
  provider_name: string; // Provider/creator name
  evaluations: Map<string, number>; // metric_name -> score
  price: number;
  latency: number;
}

// LLM-specific model data extending base ModelData
export interface LLMModelData extends ModelData {
  evaluations: Map<string, number>; // All your LLM metrics
  price_per_1M_input_tokens: number;
  price_per_1M_output_tokens: number;
  median_output_tokens_per_second: number;
  median_time_to_first_token: number;
  // Model health tracking
  failures: number;
  lastFailure: number;
  disabledUntil?: number | undefined;
  disabledReason: 'TEMPORARY' | 'PERMANENT' | null;
}

// Media-specific model data extending base ModelData
export interface MediaModelData extends ModelData {
  evaluations: Map<string, number>; // All your media metrics
  elo: number;
  rank: number;
  ci95: string;
  model_type: string; // Your added field
  categories?: {
    style_category?: string;
    subject_matter_category?: string;
    elo?: number;
    ci95?: string;
  }[];
  // Model health tracking
  failures: number;
  lastFailure: number;
  disabledUntil?: number | undefined;
  disabledReason: 'TEMPORARY' | 'PERMANENT' | null;
}

// Main data structures
interface LLMProviderData extends ProviderData {
  models: Map<string, LLMModelData>;
}

interface MediaProviderData extends ProviderData {
  models: Map<string, MediaModelData>;
}


  export class RouterClient {
    private readonly AI_ANALYSIS_API: string;
    private readonly fetchFn: typeof fetch;
    private lastInitialization: number = 0;
    private readonly providers: Array<{provider_name: string, api_key: string}>;
    
    // Services for different responsibilities
    private dataService: DataManagementService;
    private providerService: ProviderManagementService;
    private fuzzyMatchingService: FuzzyMatchingService;
    private configService: ConfigurationService;
    private chatService: ChatService;
    
    // New hierarchical data structure
    private llmProviders: Map<string, LLMProviderData> = new Map();
    private mediaProviders: Map<string, MediaProviderData> = new Map();
    
    constructor(options: RouterClientOptions = {}) {
      if (typeof window !== "undefined") {
        throw new Error("AI Router is server-only. Do not use in the browser.");
      }
      const key = options.AI_ANALYSIS_API ?? process.env.AI_ANALYSIS_API;
      if (!key) throw new Error("Missing Artificial Analysis API key (or AI_ANALYSIS_API)");
      this.AI_ANALYSIS_API = key;
      this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
      
      // Set configuration with defaults
      const maxAge = options.maxAge ?? 168; // Default: 1 week
      
              // Set other options with defaults
      const staleCleanUp = options.stale_clean_up ?? true;
        this.providers = options.providers ?? [];
        
      // Initialize services
      this.configService = new ConfigurationService(
        options.modelSelection || {}, // Pass user's modelSelection config
        maxAge,
        staleCleanUp
      );
      
      this.dataService = new DataManagementService(
        this.AI_ANALYSIS_API,
        this.fetchFn,
        this.llmProviders,
        this.mediaProviders
      );
      
      this.providerService = new ProviderManagementService(
        this.llmProviders,
        this.mediaProviders,
        this.providers
      );
      
      this.fuzzyMatchingService = new FuzzyMatchingService(
        this.llmProviders,
        this.mediaProviders
      );
      
      // Initialize chat service
      this.chatService = new ChatService(this);
      
      // Process provider API keys if provided
      if (this.providers.length > 0) {
        this.providerService.processProviderAPIKeys(this.providers);
      }
    }

    async initialize(): Promise<void> {
      // Clear existing data for fresh start
      this.llmProviders.clear();
      this.mediaProviders.clear();
      
      // Fetch and populate data fresh using data service
      await this.dataService.populateLLMData();
      await this.dataService.populateMediaData();
      
      // Set initialization timestamp
      this.lastInitialization = Date.now();

      // Process provider API keys if provided
      if (this.providers) {
        this.providerService.processProviderAPIKeys(this.providers);
      }
    }

    // Public method to refresh data while preserving last_used timestamps
    async refreshData(): Promise<void> {
      // Fetch and update data (preserving last_used timestamps) using data service
      await this.dataService.populateLLMData();
      await this.dataService.populateMediaData();
      
      // Update initialization timestamp
      this.lastInitialization = Date.now();
      
      console.log('Data refreshed while preserving usage history');
    }

    //////////////////   User avaliable methods     ////////////////////////////////////
    getModelSelection() {
      return this.configService.getModelSelection();
    }

    getSelectionStrategy() {
      return this.configService.getSelectionStrategy();
    }

    isRotatingEnabled() {
      return this.configService.isRotatingEnabled();
    }

    getMaxAge() {
      return this.configService.getMaxAge();
    }

    isStaleCleanUpEnabled() {
      return this.configService.isStaleCleanUpEnabled();
    }

      getProviders(): string[] {
    return this.providerService.getProviders();
  }

  /**
   * Get provider configuration including API key
   */
  getProviderConfig(providerName: string): {provider_name: string, api_key: string} | undefined {
    return this.providerService.getProviderConfig(providerName);
  }

  /**
   * Get LLM providers (for ChatService rotation logic)
   */
  getLLMProviders(): Map<string, LLMProviderData> {
    return this.llmProviders;
  }

  /**
   * Get Media providers (for ChatService rotation logic)  
   */
  getMediaProviders(): Map<string, MediaProviderData> {
    return this.mediaProviders;
  }

    // Configuration setters
    setMaxAge(maxAge: number): void {
      this.configService.setMaxAge(maxAge);
    }

    // Model selection setters
    setCheapest(enabled: boolean): void {
      this.configService.setCheapest(enabled);
    }

    setAccurate(enabled: boolean): void {
      this.configService.setAccurate(enabled);
    }

    setMiddle(enabled: boolean): void {
      this.configService.setMiddle(enabled);
    }

    setRotating(enabled: boolean): void {
      this.configService.setRotating(enabled);
    }

    setStaleCleanUp(enabled: boolean): void {
      this.configService.setStaleCleanUp(enabled);
    }

    // Provider management
    addProvider(providerName: string, apiKey: string): void {
      this.providerService.addProvider(providerName, apiKey);
    }

    removeProviderFromConfig(providerName: string): boolean {
      return this.providerService.removeProviderFromConfig(providerName);
    }

    updateProviderAPIKey(providerName: string, newApiKey: string): boolean {
      return this.providerService.updateProviderAPIKey(providerName, newApiKey);
    }

    // User-controlled removal methods
    removeProvider(providerName: string): boolean {
      return this.providerService.removeProvider(providerName);
    }

    removeModel(providerName: string, modelName: string): boolean {
      return this.providerService.removeModel(providerName, modelName);
    }

      /**
   * Execute a chat request using the smart routing system
   */
  async chat(userRequest: string): Promise<{success: boolean, data: string}> {
    return this.chatService.execute(userRequest);
  }

    

    /**
     * Get filtered models based on API keys and relevant metrics
     * @param relevantMetrics - Array of relevant evaluation metrics for filtering
     * @param priorityMetrics - Array of priority evaluation metrics (not used in filtering)
     * @param count - Maximum number of models to return (default: 10)
     * @returns Array of filtered models ready for strategy-based selection
     */
    getFilteredModels(relevantMetrics: string[], priorityMetrics: string[], count: number = 10): (LLMModelData | MediaModelData)[] {
      try {
        console.log(`[Model Selection] Starting model filtering with ${relevantMetrics.length} relevant metrics and ${priorityMetrics.length} priority metrics`);
        console.log(`[Model Selection] Relevant metrics: ${relevantMetrics.join(', ')}`);
        console.log(`[Model Selection] Priority metrics: ${priorityMetrics.join(', ')}`);
        
        // Step 1: API Key Validation - only models from configured providers
        const apiKeyValidModels = this.getModelsWithAPIKeys();
        console.log(`[Model Selection] Found ${apiKeyValidModels.length} models with valid API keys`);
        
        // Step 2: Metric-Based Filtering (models with relevant metrics)
        const metricFilteredModels = this.filterModelsByMetrics(apiKeyValidModels, relevantMetrics, priorityMetrics);
        console.log(`[Model Selection] After metric filtering: ${metricFilteredModels.length} models with relevant metrics`);
        
        // Step 3: Return filtered models (selection strategy will handle ranking)
        const topModels = metricFilteredModels.slice(0, count);
        console.log(`[Model Selection] Returning ${topModels.length} filtered models for strategy-based selection`);
        
        return topModels;
      } catch (error) {
        console.error('[Model Selection] Error in model filtering:', error);
        return [];
      }
    }

    // Data health and freshness methods
    isInitialized(): boolean {
      return this.lastInitialization > 0;
    }

    getLastInitialization(): number {
      return this.lastInitialization;
    }

    isDataStale(maxAgeHours?: number): boolean {
      return this.configService.isDataStale(this.lastInitialization, maxAgeHours);
    }

    async ensureFreshData(maxAgeHours?: number): Promise<void> {
      const ageToUse = maxAgeHours ?? this.configService.getMaxAge(); // Use configured default if not specified
      if (this.isDataStale(ageToUse)) {
        console.log('Data is stale, refreshing...');
        await this.refreshData();
      }
    }

    getDataHealth() {
      return this.configService.getDataHealth(this.lastInitialization);
    }

    /**
     * Get all models from providers that have API keys configured
     */
    private getModelsWithAPIKeys(): (LLMModelData | MediaModelData)[] {
      const validModels: (LLMModelData | MediaModelData)[] = [];
      
      // Collect LLM models with API keys
      for (const [providerName, providerData] of this.llmProviders) {
        if (providerData.has_api_key) {
          for (const [modelName, modelData] of providerData.models) {
            validModels.push(modelData);
          }
        }
      }
      
      // Collect Media models with API keys
      for (const [providerName, providerData] of this.mediaProviders) {
        if (providerData.has_api_key) {
          for (const [modelName, modelData] of providerData.models) {
            validModels.push(modelData);
          }
        }
      }
      
      return validModels;
    }

        /**
     * Filter models based on relevant metrics only
     * Selection strategy will determine how to rank/order these models
     */
    private filterModelsByMetrics(
      models: (LLMModelData | MediaModelData)[], 
      relevantMetrics: string[], 
      priorityMetrics: string[] // Not used here - strategy determines ordering
    ): (LLMModelData | MediaModelData)[] {
      // Filter models to only include those with relevant metrics
      return models.filter(model => 
        relevantMetrics.some(metric => model.evaluations.has(metric))
      );
    }
}