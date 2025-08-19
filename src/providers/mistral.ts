import type { BaseProvider, ProviderResult, ProviderError } from './base.js';
import { Mistral } from '@mistralai/mistralai';

export class MistralProvider implements BaseProvider {
    private apiKey: string;
    private client: any; // We'll type this properly later

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.client = new Mistral({
            apiKey: apiKey,
        });
    }

    async sendMessage(model: string, message: string): Promise<ProviderResult<string>> {
        try {
            const response = await this.client.chat.completions.create({
                model: model,
                messages: [{role: 'user', content: message}],
            });
            return {
                success: true,
                data: response.choices[0].message.content || '',
                provider: 'mistral',
                model: model,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                provider: 'mistral',
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