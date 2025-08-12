export type RouterClientOptions = {
    AI_ANALYSIS_API?: string;
    fetchFn?: typeof fetch;
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

// Router client interface
interface RouterClientInterface {
  getLastInitialization(): number;
  isDataStale(maxAgeHours?: number): boolean;
  ensureFreshData(maxAgeHours?: number): Promise<void>;
  getDataHealth(): {
    lastUpdate: Date;
    ageHours: number;
    isStale: boolean;
    status: 'stale' | 'fresh';
  };
  updateModelUsage(provider: string, model: string): void; // Update last_used timestamp
}

  export class RouterClient {
    private readonly AI_ANALYSIS_API: string;
    private readonly fetchFn: typeof fetch;
    private lastInitialization: number = 0;
    
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
    }
    
    async initialize(): Promise<void> {
        // Fetch and update data (preserving last_used timestamps)
        await this.#populateLLMData();
        await this.#populateMediaData();
        
        // Set initialization timestamp
        this.lastInitialization = Date.now();
        
    }

    // Helper methods for ensuring providers and models exist
    private ensureLLMProvider(providerName: string): LLMProviderData {
        if (!this.llmProviders.has(providerName)) {
            this.llmProviders.set(providerName, {
                has_api_key: false, // Will be set when API key is provided
                models: new Map()
            });
        }
        return this.llmProviders.get(providerName)!;
    }

    private ensureMediaProvider(providerName: string): MediaProviderData {
        if (!this.mediaProviders.has(providerName)) {
            this.mediaProviders.set(providerName, {
                has_api_key: false, // Will be set when API key is provided
                models: new Map()
            });
        }
        return this.mediaProviders.get(providerName)!;
    }

    private ensureLLMModel(providerName: string, modelName: string): LLMModelData {
        const provider = this.ensureLLMProvider(providerName);
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

    private ensureMediaModel(providerName: string, modelName: string): MediaModelData {
        const provider = this.ensureMediaProvider(providerName);
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
            const modelData = this.ensureLLMModel(providerName, modelName);

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
            const modelData = this.ensureMediaModel(providerName, modelName);

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

    // Bulk update API key status for multiple providers
    #updateMultipleProvidersAPIKeyStatus(providerUpdates: Array<{provider: string, hasAPIKey: boolean}>): void {
        for (const update of providerUpdates) {
            this.#updateProviderAPIKeyStatus(update.provider, update.hasAPIKey);
        }
        console.log(`Updated API key status for ${providerUpdates.length} providers`);
    }

    // Data health and freshness methods
    getLastInitialization(): number {
        return this.lastInitialization;
    }

    isDataStale(maxAgeHours: number = 168): boolean { // 168 = 7 days * 24 hours
        const hoursSinceUpdate = (Date.now() - this.lastInitialization) / (1000 * 60 * 60);
        return hoursSinceUpdate > maxAgeHours;
    }

    async ensureFreshData(maxAgeHours: number = 168): Promise<void> { // Default to 1 week
        if (this.isDataStale(maxAgeHours)) {
            console.log('Data is stale, re-initializing...');
            await this.initialize();
        }
    }

    getDataHealth() {
        const age = Date.now() - this.lastInitialization;
        const ageHours = age / (1000 * 60 * 60);
        
        return {
            lastUpdate: new Date(this.lastInitialization),
            ageHours: Math.round(ageHours * 100) / 100,
            isStale: ageHours > 168, // Check against 1 week default
            status: ageHours > 168 ? 'stale' as const : 'fresh' as const
        };
    }

    updateModelUsage(provider: string, model: string): void {
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
  }