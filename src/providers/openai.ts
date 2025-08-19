import type { BaseProvider, ProviderResult, ProviderError } from './base.js';
import OpenAI from 'openai';

/**
 * OpenAI provider implementation.
 * Handles communication with OpenAI's API.
 */
export class OpenAIProvider implements BaseProvider {
  private apiKey: string;
  private client: any; // We'll type this properly later

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new OpenAI({
      apiKey: apiKey,
    });
  }

  /**
   * Send a text message to an OpenAI model.
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
        provider: 'openai',
        model: model,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'openai',
        model: model,
      };
    }
  }

  /**
   * Check if OpenAI provider is available.
   */
  isAvailable(): boolean {
    return this.apiKey !== undefined && this.apiKey.length > 0;
  }

  /**
   * Get OpenAI provider capabilities.
   */
  getCapabilities(): string[] {
    return ['text']; // Add more capabilities as needed
  }
}