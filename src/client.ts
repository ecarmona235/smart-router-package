export type RouterClientOptions = {
    AI_ANALYSIS_API?: string;
    fetchFn?: typeof fetch;
    maxAge?: number; // in hours, default 168 (1 week)
    hierarchy?: {
        first: 'last_used' | 'accuracy' | 'price' | 'latency';
        second: 'last_used' | 'accuracy' | 'price' | 'latency';
        third: 'last_used' | 'accuracy' | 'price' | 'latency';
        last: 'last_used' | 'accuracy' | 'price' | 'latency';
    };
    providers?: Array<{
        provider_name: string;
        api_key: string;
    }>;
    stale_clean_up?: boolean; // true by default, removes stale unused models
    reasoning?: boolean; // false by default, returns reasoning of why model was chosen
};

// Provider-level interface
interface ProviderData {
  has_api_key: boolean;
  models: Map<string, ModelData>;
}

// Base model interface
interface ModelData {
  name: string; // Model name
  provider_name: string; // Provider/creator name
  evaluations: Map<string, number>; // metric_name -> score
  price: number;
  latency: number;
  last_used: Date | null; // Can be null initially
}

// LLM-specific model data extending base ModelData
interface LLMModelData extends ModelData {
  evaluations: Map<string, number>; // All your LLM metrics
  price_per_1M_input_tokens: number;
  price_per_1M_output_tokens: number;
  median_output_tokens_per_second: number;
  median_time_to_first_token: number;
  last_used: Date | null; // Can be null initially
}

// Media-specific model data extending base ModelData
interface MediaModelData extends ModelData {
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
  last_used: Date | null; // Can be null initially
}

// Main data structures
interface LLMProviderData extends ProviderData {
  models: Map<string, LLMModelData>;
}

interface MediaProviderData extends ProviderData {
  models: Map<string, MediaModelData>;
}

// For your RouterClient class
interface RouterData {
  llmProviders: Map<string, LLMProviderData>;
  mediaProviders: Map<string, MediaProviderData>;
  lastInitialization: number; // Timestamp of last data refresh
}



  export class RouterClient {
    private readonly AI_ANALYSIS_API: string;
    private readonly fetchFn: typeof fetch;
    private lastInitialization: number = 0;
    private readonly providers: Array<{provider_name: string, api_key: string}>;
    // Configuration options (mutable for user updates)
    private maxAge: number;
    private hierarchy: {
        first: 'last_used' | 'accuracy' | 'price' | 'latency';
        second: 'last_used' | 'accuracy' | 'price' | 'latency';
        third: 'last_used' | 'accuracy' | 'price' | 'latency';
        last: 'last_used' | 'accuracy' | 'price' | 'latency';
    };
    private staleCleanUp: boolean;
    private reasoning: boolean;
    
    // New hierarchical data structure
    private llmProviders: Map<string, LLMProviderData> = new Map();
    private mediaProviders: Map<string, MediaProviderData> = new Map();
    
    // Provider name resolution system
    private providerMappings: Map<string, string> = new Map(); // user_name -> actual_name
    private providerApiKeys: Map<string, string> = new Map(); // user_name -> api_key
    
    constructor(options: RouterClientOptions = {}) {
        if (typeof window !== "undefined") {
            throw new Error("AI Router is server-only. Do not use in the browser.");
        }
        const key = options.AI_ANALYSIS_API ?? process.env.AI_ANALYSIS_API;
        if (!key) throw new Error("Missing Artificial Analysis API key (or AI_ANALYSIS_API)");
        this.AI_ANALYSIS_API = key;
        this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
        
        // Set configuration with defaults
        this.maxAge = options.maxAge ?? 168; // Default: 1 week
        
        // Set hierarchy with defaults (accuracy -> price -> latency -> last_used)
        this.hierarchy = options.hierarchy ?? {
            first: 'accuracy',
            second: 'price',
            third: 'latency',
            last: 'last_used'
        };
        
        // Set other options with defaults
        this.staleCleanUp = options.stale_clean_up ?? true;
        this.reasoning = options.reasoning ?? false;
        this.providers = options.providers ?? [];
        
        // Process provider API keys if provided
        if (this.providers.length > 0) {
            this.#processProviderAPIKeys(this.providers);
        }
    }

    // Normalize provider names for matching
    #normalizeProviderName(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '') // Remove spaces, hyphens, etc.
            .trim();
    }

    // Find closest provider using fuzzy matching against API data only
    #findClosestProvider(userInput: string): string | null {
        const normalizedInput = this.#normalizeProviderName(userInput);
        let bestMatch: string | null = null;
        let bestScore = Infinity;
        
        // Check against actual API provider names from LLM data
        for (const [apiProviderName] of this.llmProviders) {
            const normalizedApi = this.#normalizeProviderName(apiProviderName);
            const distance = this.#levenshteinDistance(normalizedInput, normalizedApi);
            
            if (distance < bestScore && distance <= 2) { // Allow 2 character differences
                bestScore = distance;
                bestMatch = apiProviderName;
            }
        }
        
        // Also check media providers
        for (const [apiProviderName] of this.mediaProviders) {
            const normalizedApi = this.#normalizeProviderName(apiProviderName);
            const distance = this.#levenshteinDistance(normalizedInput, normalizedApi);
            
            if (distance < bestScore && distance <= 2) { // Allow 2 character differences
                bestScore = distance;
                bestMatch = apiProviderName;
            }
        }
        
        return bestMatch;
    }

    #levenshteinDistance(str1: string, str2: string): number {
      if (str1.length === 0) return str2.length;
      if (str2.length === 0) return str1.length;
      
      // Initialize matrix with explicit typing to avoid undefined errors
      const matrix: number[][] = [];
      for (let j = 0; j <= str2.length; j++) {
          const row: number[] = new Array(str1.length + 1).fill(0);
          matrix[j] = row;
      }
      
      // Fill first row and column
      for (let i = 0; i <= str1.length; i++) {
          matrix[0]![i] = i;
      }
      for (let j = 0; j <= str2.length; j++) {
          matrix[j]![0] = j;
      }
      
      // Fill rest of matrix
      for (let j = 1; j <= str2.length; j++) {
          for (let i = 1; i <= str1.length; i++) {
              const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
              const currentRow = matrix[j]!;
              const prevRow = matrix[j - 1]!;
              currentRow[i] = Math.min(
                  currentRow[i - 1]! + 1,
                  prevRow[i]! + 1,
                  prevRow[i - 1]! + cost
              );
          }
      }
      
      return matrix[str2.length]![str1.length]!;
  }

    // Resolve provider name using fuzzy matching against API data
    #resolveProviderName(userInput: string): string | null {
        return this.#findClosestProvider(userInput);
    }

    // Process provider API keys from options
    #processProviderAPIKeys(providers: Array<{provider_name: string, api_key: string}>): void {
        for (const provider of providers) {
            // Set API key status to true for provided providers
            this.#updateProviderAPIKeyStatus(provider.provider_name, true);
        }
        console.log(`Processed ${providers.length} provider API keys`);
    }
    
    async initialize(): Promise<void> {
        // Clear existing data for fresh start
        this.llmProviders.clear();
        this.mediaProviders.clear();
        
        // Fetch and populate data fresh
        await this.#populateLLMData();
        await this.#populateMediaData();
        
        // Set initialization timestamp
        this.lastInitialization = Date.now();

                // Process provider API keys if provided
        if (this.providers) {
          this.#processProviderAPIKeys(this.providers);
      }
        
    }

    // Public method to refresh data while preserving last_used timestamps
    async refreshData(): Promise<void> {
        // Fetch and update data (preserving last_used timestamps)
        await this.#populateLLMData();
        await this.#populateMediaData();
        
        // Update initialization timestamp
        this.lastInitialization = Date.now();
        
        console.log('Data refreshed while preserving usage history');
    }

    // Helper methods for ensuring providers and models exist
    #ensureLLMProvider(providerName: string): LLMProviderData {
        if (!this.llmProviders.has(providerName)) {
            this.llmProviders.set(providerName, {
                has_api_key: false, // Will be set when API key is provided
                models: new Map()
            });
        }
        return this.llmProviders.get(providerName)!;
    }

    #ensureMediaProvider(providerName: string): MediaProviderData {
        if (!this.mediaProviders.has(providerName)) {
            this.mediaProviders.set(providerName, {
                has_api_key: false, // Will be set when API key is provided
                models: new Map()
            });
        }
        return this.mediaProviders.get(providerName)!;
    }

    #ensureLLMModel(providerName: string, modelName: string): LLMModelData {
        const provider = this.#ensureLLMProvider(providerName);
        if (!provider.models.has(modelName)) {
            provider.models.set(modelName, {
                name: modelName,
                provider_name: providerName,
                evaluations: new Map(),
                price: 0,
                latency: 0,
                last_used: null, // Initialize as null, not used yet
                price_per_1M_input_tokens: 0,
                price_per_1M_output_tokens: 0,
                median_output_tokens_per_second: 0,
                median_time_to_first_token: 0
            });
        }
        return provider.models.get(modelName)!;
    }

    #ensureMediaModel(providerName: string, modelName: string): MediaModelData {
        const provider = this.#ensureMediaProvider(providerName);
        if (!provider.models.has(modelName)) {
            provider.models.set(modelName, {
                name: modelName,
                provider_name: providerName,
                evaluations: new Map(),
                price: 0,
                latency: 0,
                last_used: null, // Initialize as null, not used yet
                elo: 0,
                rank: 0,
                ci95: '',
                model_type: '',
                categories: []
            });
        }
        return provider.models.get(modelName)!;
    }

    async #populateLLMData(): Promise<void> {
        const data = await this.#makeAPICall("llms/models");
        this.#extractLLMData(data);
        
        // Remove only unused models that are no longer available from the API
        this.#removeUnusedStaleLLMModels(data);
    }

    async #populateMediaData(): Promise<void> {
        const [ttiData, imageEditingData, ttsData, ttvData, imageToVideoData] = await Promise.all([
            this.#makeAPICall("media/text-to-image"),
            this.#makeAPICall("media/image-editing"),
            this.#makeAPICall("media/text-to-speech"),
            this.#makeAPICall("media/text-to-video"),
            this.#makeAPICall("media/image-to-video")
        ]);

        this.#extractMediaData(ttiData, "Text-To-Image");
        this.#extractMediaData(imageEditingData, "Image-editing");
        this.#extractMediaData(ttsData, "Text-To-Speech");
        this.#extractMediaData(ttvData, "text-to-video");
        this.#extractMediaData(imageToVideoData, "image-to-video");
        
        // Remove only unused models that are no longer available from the API
        this.#removeUnusedStaleMediaModels([ttiData, imageEditingData, ttsData, ttvData, imageToVideoData]);
    }

    #extractLLMData(data: any[]): void {
        for (const item of data) {
            const providerName = item.model_creator.name;
            const modelName = item.name;
            const modelData = this.#ensureLLMModel(providerName, modelName);

            // Update model data (preserving last_used if it exists)
            modelData.price_per_1M_input_tokens = item.price_per_1M_input_tokens;
            modelData.price_per_1M_output_tokens = item.price_per_1M_output_tokens;
            modelData.median_output_tokens_per_second = item.median_output_tokens_per_second;
            modelData.median_time_to_first_token = item.median_time_to_first_token;
            
            // Set price and latency for base ModelData
            modelData.price = item.price_per_1M_input_tokens;
            modelData.latency = item.median_time_to_first_token;

            // Populate evaluations
            if (item.evaluations && Array.isArray(item.evaluations)) {
                for (const evaluation of item.evaluations) {
                    // Extract all evaluation metrics
                    const metrics = [
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
                    ];

                    for (const metric of metrics) {
                        if (evaluation[metric] !== null && evaluation[metric] !== undefined) {
                            modelData.evaluations.set(metric, evaluation[metric]);
                        }
                    }
                }
            }
        }
    }

    #extractMediaData(data: any[], model_type: string): void {
        for (const item of data) {
            const providerName = item.model_creator.name;
            const modelName = item.name;
            const modelData = this.#ensureMediaModel(providerName, modelName);

            // Update model data (preserving last_used if it exists)
            modelData.model_type = model_type;
            modelData.elo = item.elo || 0;
            modelData.rank = item.rank || 0;
            modelData.ci95 = item.ci95 || '';
            
            // Set price and latency for base ModelData (using default values for media)
            modelData.price = 0; // Media models don't have token-based pricing
            modelData.latency = 0; // Media models don't have token-based latency

            // Populate evaluations
            if (item.elo !== null && item.elo !== undefined) {
                modelData.evaluations.set('elo', item.elo);
            }
            if (item.rank !== null && item.rank !== undefined) {
                modelData.evaluations.set('rank', item.rank);
            }

            // Handle categories if they exist
            if (item.categories && Array.isArray(item.categories)) {
                modelData.categories = item.categories.map((category: any) => ({
                    style_category: category.style_category,
                    subject_matter_category: category.subject_matter_category,
                    elo: category.elo,
                    ci95: category.ci95,
                }));
            }
        }
    }

    // Remove only unused models that are no longer available from the API
    #removeUnusedStaleLLMModels(apiData: any[]): void {
        const apiModelKeys = new Set(apiData.map(item => `${item.model_creator.name}:${item.name}`));
        
        for (const [providerName, provider] of this.llmProviders) {
            for (const [modelName, modelData] of provider.models) {
                const modelKey = `${providerName}:${modelName}`;
                // Only remove if: not in API AND never used
                if (!apiModelKeys.has(modelKey) && modelData.last_used === null) {
                    provider.models.delete(modelName);
                    console.log(`Removed unused stale LLM model: ${providerName}:${modelName}`);
                }
            }
            
            // Remove empty providers
            if (provider.models.size === 0) {
                this.llmProviders.delete(providerName);
                console.log(`Removed empty LLM provider: ${providerName}`);
            }
        }
    }

    // Remove only unused models that are no longer available from the API
    #removeUnusedStaleMediaModels(apiDataArrays: any[][]): void {
        const apiModelKeys = new Set();
        
        // Collect all model keys from all media API endpoints
        for (const apiData of apiDataArrays) {
            for (const item of apiData) {
                apiModelKeys.add(`${item.model_creator.name}:${item.name}`);
            }
        }
        
        for (const [providerName, provider] of this.mediaProviders) {
            for (const [modelName, modelData] of provider.models) {
                const modelKey = `${providerName}:${modelName}`;
                // Only remove if: not in API AND never used
                if (!apiModelKeys.has(modelKey) && modelData.last_used === null) {
                    provider.models.delete(modelName);
                    console.log(`Removed unused stale media model: ${providerName}:${modelName}`);
                }
            }
            
            // Remove empty providers
            if (provider.models.size === 0) {
                this.mediaProviders.delete(providerName);
                console.log(`Removed empty media provider: ${providerName}`);
            }
        }
    }

    // Update API key status for providers
    #updateProviderAPIKeyStatus(providerName: string, hasAPIKey: boolean): boolean {
        let updated = false;
        
        // Update LLM provider
        const llmProvider = this.llmProviders.get(providerName);
        if (llmProvider) {
            llmProvider.has_api_key = hasAPIKey;
            updated = true;
        }
        
        // Update media provider
        const mediaProvider = this.mediaProviders.get(providerName);
        if (mediaProvider) {
            mediaProvider.has_api_key = hasAPIKey;
            updated = true;
        }
        
        if (updated) {
            console.log(`Updated API key status for ${providerName}: ${hasAPIKey ? 'has access' : 'no access'}`);
        } else {
            console.log(`Provider not found: ${providerName}`);
        }
        
        return updated;
    }

    #updateModelUsage(provider: string, model: string): void {
      // Update LLM model usage
      const llmModel = this.llmProviders.get(provider)?.models.get(model);
      if (llmModel) {
          llmModel.last_used = new Date();
      }

      // Update media model usage
      const mediaModel = this.mediaProviders.get(provider)?.models.get(model);
      if (mediaModel) {
          mediaModel.last_used = new Date();
      }
  }

  async #makeAPICall(endpoint: string): Promise<any[]> {
    try {
      const res = await this.fetchFn(`https://artificialanalysis.ai/api/v2/data/${endpoint}`, {
        method: "GET",
        headers: { "x-api-key": this.AI_ANALYSIS_API },
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      return data.data;
    } catch (error) {
      console.error(`API call failed for ${endpoint}:`, error);
      throw error;
    }
  }


    //////////////////   User avaliable methods     ////////////////////////////////////
    getHierarchy() {
        return this.hierarchy;
    }

    getMaxAge() {
        return this.maxAge;
    }

    isReasoningEnabled() {
        return this.reasoning;
    }

    isStaleCleanUpEnabled() {
        return this.staleCleanUp;
    }

    getProviders(): string[] {
        return this.providers.map(p => p.provider_name);
    }

    // Configuration setters
    setMaxAge(maxAge: number): void {
        if (maxAge <= 0) {
            throw new Error('maxAge must be greater than 0');
        }
        this.maxAge = maxAge;
        console.log(`Max age updated to ${maxAge} hours`);
    }

    setHierarchy(hierarchy: {
        first: 'last_used' | 'accuracy' | 'price' | 'latency';
        second: 'last_used' | 'accuracy' | 'price' | 'latency';
        third: 'last_used' | 'accuracy' | 'price' | 'latency';
        last: 'last_used' | 'accuracy' | 'price' | 'latency';
    }): void {
        // Validate that all values are valid hierarchy options
        const validOptions = ['last_used', 'accuracy', 'price', 'latency'] as const;
        const values = [hierarchy.first, hierarchy.second, hierarchy.third, hierarchy.last];
        
        for (const value of values) {
            if (!validOptions.includes(value)) {
                throw new Error(`Invalid hierarchy option: ${value}. Must be one of: ${validOptions.join(', ')}`);
            }
        }
        
        this.hierarchy = hierarchy;
        console.log('Routing hierarchy updated:', hierarchy);
    }

    setReasoning(enabled: boolean): void {
        this.reasoning = enabled;
        console.log(`Reasoning ${enabled ? 'enabled' : 'disabled'}`);
    }

    setStaleCleanUp(enabled: boolean): void {
        this.staleCleanUp = enabled;
        console.log(`Stale cleanup ${enabled ? 'enabled' : 'disabled'}`);
    }

    // Provider management
    addProvider(providerName: string, apiKey: string): void {
        // Check if provider already exists
        const existingProvider = this.providers.find(p => p.provider_name === providerName);
        if (existingProvider) {
            existingProvider.api_key = apiKey; // Update existing API key
            console.log(`Updated API key for provider: ${providerName}`);
        } else {
            this.providers.push({ provider_name: providerName, api_key: apiKey });
            console.log(`Added new provider: ${providerName}`);
        }
        
        // Update provider access status
        this.#updateProviderAPIKeyStatus(providerName, true);
    }

    removeProviderFromConfig(providerName: string): boolean {
        const index = this.providers.findIndex(p => p.provider_name === providerName);
        if (index !== -1) {
            this.providers.splice(index, 1);
            
            // Update provider access status to false
            this.#updateProviderAPIKeyStatus(providerName, false);
            
            console.log(`Removed provider from config: ${providerName}`);
            return true;
        }
        return false;
    }

    updateProviderAPIKey(providerName: string, newApiKey: string): boolean {
        const provider = this.providers.find(p => p.provider_name === providerName);
        if (provider) {
            provider.api_key = newApiKey;
            console.log(`Updated API key for provider: ${providerName}`);
            return true;
        }
        return false;
    }

    // Data health and freshness methods
    isInitialized(): boolean {
        return this.lastInitialization > 0;
    }

    getLastInitialization(): number {
        return this.lastInitialization;
    }

    isDataStale(maxAgeHours?: number): boolean {
        const ageToUse = maxAgeHours ?? this.maxAge; // Use configured default if not specified
        const hoursSinceUpdate = (Date.now() - this.lastInitialization) / (1000 * 60 * 60);
        return hoursSinceUpdate > ageToUse;
    }

    async ensureFreshData(maxAgeHours?: number): Promise<void> {
        const ageToUse = maxAgeHours ?? this.maxAge; // Use configured default if not specified
        if (this.isDataStale(ageToUse)) {
            console.log('Data is stale, refreshing...');
            await this.refreshData();
        }
    }

    getDataHealth() {
        const age = Date.now() - this.lastInitialization;
        const ageHours = age / (1000 * 60 * 60);
        
        return {
            lastUpdate: new Date(this.lastInitialization),
            ageHours: Math.round(ageHours * 100) / 100,
            isStale: ageHours > this.maxAge, // Check against configured default
            status: ageHours > this.maxAge ? 'stale' as const : 'fresh' as const
        };
    }

    // User-controlled removal methods
    removeProvider(providerName: string): boolean {
      const llmRemoved = this.llmProviders.delete(providerName);
      const mediaRemoved = this.mediaProviders.delete(providerName);
      
      if (llmRemoved || mediaRemoved) {
          console.log(`Removed provider: ${providerName}`);
          return true;
      }
      return false;
  }

  removeModel(providerName: string, modelName: string): boolean {
      let removed = false;
      
      // Remove from LLM providers
      const llmProvider = this.llmProviders.get(providerName);
      if (llmProvider?.models.has(modelName)) {
          llmProvider.models.delete(modelName);
          removed = true;
      }
      
      // Remove from media providers
      const mediaProvider = this.mediaProviders.get(providerName);
      if (mediaProvider?.models.has(modelName)) {
          mediaProvider.models.delete(modelName);
          removed = true;
      }
      
      // Clean up empty providers
      if (llmProvider && llmProvider.models.size === 0) {
          this.llmProviders.delete(providerName);
      }
      if (mediaProvider && mediaProvider.models.size === 0) {
          this.mediaProviders.delete(providerName);
      }
      
      if (removed) {
          console.log(`Removed model: ${providerName}:${modelName}`);
      }
      return removed;
  }


}