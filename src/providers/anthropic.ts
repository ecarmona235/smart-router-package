import type { BaseProvider, ProviderResult, ProviderError } from './base.js';
import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider implements BaseProvider {
    private apiKey: string;
    private client: any; 

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.client = new Anthropic({
            apiKey: apiKey,
        });
    }

    async sendMessage(model: string, message: string): Promise<ProviderResult<string>> {
        try {
            const response = await this.client.messages.create({
                model: model,
                messages: [{role: 'user', content: message}],
            });
            return {
                success: true,
                data: response.content[0].text,
                provider: 'anthropic',
                model: model,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                provider: 'anthropic',
                model: model,
            };
        }
    }

    isAvailable(): boolean {
        return this.apiKey !== undefined && this.apiKey.length > 0;
    }

    getCapabilities(): string[] {
        return ['text'];
    }
}