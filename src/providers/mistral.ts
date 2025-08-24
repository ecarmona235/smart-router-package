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

    async extractTextFromImage(
        model: string,
        imagePath: string,
        options?: { maxTokens?: number; temperature?: number }
    ): Promise<ProviderResult<string>> {
        try {
            // Convert file path to base64 for Mistral API
            const imageFile = await this.pathToFile(imagePath);
            
            const response = await this.client.chat.completions.create({
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Extract and transcribe all text visible in this image. Provide the text exactly as it appears, maintaining formatting and structure.'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/png;base64,${imageFile}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: options?.maxTokens || 1000,
                temperature: options?.temperature || 0.1,
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

    async embedText(
        model: string,
        text: string
    ): Promise<ProviderResult<number[]>> {
        try {
            const response = await this.client.embeddings.create({
                model: model,
                input: text,
            });

            if (response.data && response.data.length > 0 && response.data[0].embedding) {
                return {
                    success: true,
                    data: response.data[0].embedding,
                    provider: 'mistral',
                    model: model,
                };
            } else {
                throw new Error('No embedding data received');
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                provider: 'mistral',
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

    getCapabilities(): string[] {
        return ['text', 'ocr', 'embedding']; // Mistral supports text, OCR, and embeddings
    }

    /**
     * Convert a file path to base64 string for Mistral API.
     * Handles both local file paths and URLs.
     */
    private async pathToFile(filePath: string): Promise<string> {
        try {
            // Check if it's a URL
            if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                const response = await fetch(filePath);
                const buffer = await response.arrayBuffer();
                return Buffer.from(buffer).toString('base64');
            }

            // For local file paths, read the file
            const fs = await import('fs/promises');
            const buffer = await fs.readFile(filePath);
            return buffer.toString('base64');
        } catch (error) {
            throw new Error(`Failed to convert file path to base64: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}