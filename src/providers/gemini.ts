import type { BaseProvider, ProviderResult, ProviderError } from './base.js';
import { GoogleGenAI } from "@google/genai";

export class GeminiProvider implements BaseProvider {
    private apiKey: string;
    private client: any; // We'll type this properly later

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.client = new GoogleGenAI({
            apiKey: apiKey,
        });
    }

    async sendMessage(model: string, message: string): Promise<ProviderResult<string>> {
        try {
        const response = await this.client.models.generateContent({
            model: model,
            contents: message,
        });
        return {
            success: true,
            data: response.text,
            provider: 'gemini',
            model: model,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                provider: 'gemini',
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