import type { LLMModelData, MediaModelData } from '../client.js';

export class DataManagementService {
  private readonly AI_ANALYSIS_API: string;
  private readonly fetchFn: typeof fetch;
  private llmProviders: Map<string, any>; // Will be passed from RouterClient
  private mediaProviders: Map<string, any>; // Will be passed from RouterClient

  constructor(
    aiAnalysisApi: string,
    fetchFn: typeof fetch,
    llmProviders: Map<string, any>,
    mediaProviders: Map<string, any>
  ) {
    this.AI_ANALYSIS_API = aiAnalysisApi;
    this.fetchFn = fetchFn;
    this.llmProviders = llmProviders;
    this.mediaProviders = mediaProviders;
  }

  /**
   * Populate LLM data from API
   */
  async populateLLMData(): Promise<void> {
    const data = await this.makeAPICall("llms/models");
    this.extractLLMData(data);
    
    // Remove only unused models that are no longer available from the API
    this.removeUnusedStaleLLMModels(data);
  }

  /**
   * Populate Media data from API
   */
  async populateMediaData(): Promise<void> {
    const [ttiData, imageEditingData, ttsData, ttvData, imageToVideoData] = await Promise.all([
      this.makeAPICall("media/text-to-image"),
      this.makeAPICall("media/image-editing"),
      this.makeAPICall("media/text-to-speech"),
      this.makeAPICall("media/text-to-video"),
      this.makeAPICall("media/image-to-video")
    ]);

    this.extractMediaData(ttiData, "Text-To-Image");
    this.extractMediaData(imageEditingData, "Image-editing");
    this.extractMediaData(ttsData, "Text-To-Speech");
    this.extractMediaData(ttvData, "text-to-video");
    this.extractMediaData(imageToVideoData, "image-to-video");
    
    // Remove only unused models that are no longer available from the API
    this.removeUnusedStaleMediaModels([ttiData, imageEditingData, ttsData, ttvData, imageToVideoData]);
  }

  /**
   * Extract LLM data from API response
   */
  private extractLLMData(data: any[]): void {
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

  /**
   * Extract Media data from API response
   */
  private extractMediaData(data: any[], model_type: string): void {
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

  /**
   * Remove unused stale LLM models
   */
  private removeUnusedStaleLLMModels(apiData: any[]): void {
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

  /**
   * Remove unused stale Media models
   */
  private removeUnusedStaleMediaModels(apiDataArrays: any[][]): void {
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

  /**
   * Make API call to Artificial Analysis API
   */
  private async makeAPICall(endpoint: string): Promise<any[]> {
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

  /**
   * Ensure LLM provider exists
   */
  private ensureLLMProvider(providerName: string): any {
    if (!this.llmProviders.has(providerName)) {
      this.llmProviders.set(providerName, {
        has_api_key: false, // Will be set when API key is provided
        models: new Map(),
        last_used: null // Initialize as null, not used yet
      });
    }
    return this.llmProviders.get(providerName)!;
  }

  /**
   * Ensure Media provider exists
   */
  private ensureMediaProvider(providerName: string): any {
    if (!this.mediaProviders.has(providerName)) {
      this.mediaProviders.set(providerName, {
        has_api_key: false, // Will be set when API key is provided
        models: new Map(),
        last_used: null // Initialize as null, not used yet
      });
    }
    return this.mediaProviders.get(providerName)!;
  }

  /**
   * Ensure LLM model exists
   */
  private ensureLLMModel(providerName: string, modelName: string): LLMModelData {
    const provider = this.ensureLLMProvider(providerName);
    if (!provider.models.has(modelName)) {
      provider.models.set(modelName, {
        name: modelName,
        provider_name: providerName,
        evaluations: new Map(),
        price: 0,
        latency: 0,
        price_per_1M_input_tokens: 0,
        price_per_1M_output_tokens: 0,
        median_output_tokens_per_second: 0,
        median_time_to_first_token: 0,
        failures: 0,
        lastFailure: 0,
        disabledUntil: undefined,
        disabledReason: null
      });
    }
    return provider.models.get(modelName)!;
  }

  /**
   * Ensure Media model exists
   */
  private ensureMediaModel(providerName: string, modelName: string): MediaModelData {
    const provider = this.ensureMediaProvider(providerName);
    if (!provider.models.has(modelName)) {
      provider.models.set(modelName, {
        name: modelName,
        provider_name: providerName,
        evaluations: new Map(),
        price: 0,
        latency: 0,
        elo: 0,
        rank: 0,
        ci95: '',
        model_type: '',
        categories: [],
        failures: 0,
        lastFailure: 0,
        disabledUntil: undefined,
        disabledReason: null
      });
    }
    return provider.models.get(modelName)!;
  }
}
