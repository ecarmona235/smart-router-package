import type { BaseProvider, ProviderResult, ProviderError } from './base.js';
import { CohereClientV2 } from "cohere-ai";

export class CohereProvider implements BaseProvider {
    private apiKey: string;
    private client: CohereClientV2;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.client = new CohereClientV2({
            token: this.apiKey,
        });
    }

    async sendMessage(model: string, message: string): Promise<ProviderResult<string>> {
        try {
            const response = await this.client.chat({
                model: model,
                messages: [{role: 'user', content: message}],

            });
            return {
                success: true,
                data: typeof response.message.content === 'string' 
                    ? response.message.content 
                    : (response.message.content as any)?.[0]?.text || '',
                provider: 'cohere',
                model: model,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                provider: 'cohere',
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