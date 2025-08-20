import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { CohereProvider } from './cohere.js';
import type { BaseProvider, ProviderName } from './base.js';

export function createProvider(
  providerName: ProviderName, 
  apiKey: string
): BaseProvider {
  switch (providerName) {
    case 'openai':
    case 'xai':
    case 'deepseek':
    case 'meta-llama':
    case 'meta-llama-groq':
      return new OpenAIProvider(apiKey, providerName);
    case 'anthropic':
      return new AnthropicProvider(apiKey);
    case 'cohere':
      return new CohereProvider(apiKey);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}
