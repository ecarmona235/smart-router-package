import type { BaseProvider, ProviderResult, ProviderError, ProviderName } from './base.js';
import { PROVIDER_CONFIGS } from './base.js';
import OpenAI from 'openai';

/**
 * OpenAI provider implementation.
 * Handles communication with OpenAI-compatible APIs.
 */
export class OpenAIProvider implements BaseProvider {
  private apiKey: string;
  private baseURL: string;
  private providerName: string;
  private client: any; // We'll type this properly later

  constructor(apiKey: string, providerName: ProviderName = 'openai') {
    this.apiKey = apiKey;
    this.providerName = providerName;
    this.baseURL = PROVIDER_CONFIGS[providerName].baseURL;
    
    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: this.baseURL,
    });
  }

  /**
   * Send a text message to an OpenAI-compatible model.
   */
  async sendMessage(model: string, message: string): Promise<ProviderResult<string>> {
    try {
      const response = await this.client.chat.completions.create({
        model: model,
        messages: [{role: 'user', content: message}],
      });
      return {
        success: true,
        data: response.choices[0].message.content || '',
        provider: this.providerName,
        model: model,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: this.providerName,
        model: model,
      };
    }
  }

  /**
   * Check if provider is available.
   */
  isAvailable(): boolean {
    return this.apiKey !== undefined && this.apiKey.length > 0;
  }

  /**
   * Get provider capabilities.
   */
  getCapabilities(): string[] {
    return ['text']; // Add more capabilities as needed
  }
}