export class ProviderManagementService {
  private llmProviders: Map<string, any>; // Will be passed from RouterClient
  private mediaProviders: Map<string, any>; // Will be passed from RouterClient
  private providers: Array<{provider_name: string, api_key: string}>;

  constructor(
    llmProviders: Map<string, any>,
    mediaProviders: Map<string, any>,
    providers: Array<{provider_name: string, api_key: string}>
  ) {
    this.llmProviders = llmProviders;
    this.mediaProviders = mediaProviders;
    this.providers = providers;
  }

  /**
   * Process provider API keys from options
   */
  processProviderAPIKeys(providers: Array<{provider_name: string, api_key: string}>): void {
    for (const provider of providers) {
      // Set API key status to true for provided providers
      this.updateProviderAPIKeyStatus(provider.provider_name, true);
    }
    console.log(`Processed ${providers.length} provider API keys`);
  }

  /**
   * Update API key status for providers
   */
  updateProviderAPIKeyStatus(providerName: string, hasAPIKey: boolean): boolean {
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

  /**
   * Update provider usage timestamp (for rotation)
   */
  updateProviderUsage(providerName: string): void {
    // Update LLM provider usage
    const llmProvider = this.llmProviders.get(providerName);
    if (llmProvider) {
      llmProvider.last_used = new Date();
      console.log(`[ProviderService] Updated LLM provider usage: ${providerName}`);
    }

    // Update media provider usage
    const mediaProvider = this.mediaProviders.get(providerName);
    if (mediaProvider) {
      mediaProvider.last_used = new Date();
      console.log(`[ProviderService] Updated Media provider usage: ${providerName}`);
    }
  }

  /**
   * Add provider to configuration
   */
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
    this.updateProviderAPIKeyStatus(providerName, true);
  }

  /**
   * Remove provider from configuration
   */
  removeProviderFromConfig(providerName: string): boolean {
    const index = this.providers.findIndex(p => p.provider_name === providerName);
    if (index !== -1) {
      this.providers.splice(index, 1);
      
      // Update provider access status to false
      this.updateProviderAPIKeyStatus(providerName, false);
      
      console.log(`Removed provider from config: ${providerName}`);
      return true;
    }
    return false;
  }

  /**
   * Update provider API key
   */
  updateProviderAPIKey(providerName: string, newApiKey: string): boolean {
    const provider = this.providers.find(p => p.provider_name === providerName);
    if (provider) {
      provider.api_key = newApiKey;
      console.log(`Updated API key for provider: ${providerName}`);
      return true;
    }
    return false;
  }

  /**
   * Remove provider completely
   */
  removeProvider(providerName: string): boolean {
    const llmRemoved = this.llmProviders.delete(providerName);
    const mediaRemoved = this.mediaProviders.delete(providerName);
    
    if (llmRemoved || mediaRemoved) {
      console.log(`Removed provider: ${providerName}`);
      return true;
    }
    return false;
  }

  /**
   * Remove specific model
   */
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

  /**
   * Get all providers
   */
  getProviders(): string[] {
    return this.providers.map(p => p.provider_name);
  }

  /**
   * Get provider configuration including API key
   */
  getProviderConfig(providerName: string): {provider_name: string, api_key: string} | undefined {
    return this.providers.find(p => p.provider_name === providerName);
  }

  /**
   * Get LLM providers
   */
  getLLMProviders(): Map<string, any> {
    return this.llmProviders;
  }

  /**
   * Get Media providers
   */
  getMediaProviders(): Map<string, any> {
    return this.mediaProviders;
  }
}
