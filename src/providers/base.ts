/**
 * Base interface that all AI providers must implement.
 * Provides a consistent interface for different AI service providers.
 */
export interface BaseProvider {
    /**
     * Send a text message to a specific model and get a response.
     * @param model - The model name to use (e.g., "gpt-4", "claude-3")
     * @param message - The text message to send
     * @returns Promise resolving to result object with success status and data/error
     */
    sendMessage(model: string, message: string): Promise<ProviderResult<string>>;
  
    /**
     * Check if this provider is available and ready to use.
     * @returns true if provider is configured and ready
     */
    isAvailable(): boolean;
  
    /**
     * Get the capabilities this provider supports.
     * @returns Array of capability strings (e.g., ["text", "embedding", "vision"])
     */
    getCapabilities(): string[];
  }
  
  /**
   * Result object for provider operations to prevent crashes.
   * Provides consistent error handling across all providers.
   */
  export interface ProviderResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    provider?: string;
    model?: string;
    retryCount?: number;
  }
  
  /**
   * Custom error class for provider-related errors (kept for internal use).
   */
  export class ProviderError extends Error {
    constructor(
      message: string,
      public provider: string,
      public model?: string,
      public originalError?: Error
    ) {
      super(message);
      this.name = 'ProviderError';
    }
  }
  
  // TODO: Future additions for enhanced functionality
  // - sendEmbedding(model: string, text: string): Promise<ProviderResult<number[]>>
  // - generateImage(model: string, prompt: string): Promise<ProviderResult<string>>
  // - transcribeAudio(model: string, audioData: Buffer): Promise<ProviderResult<string>>
  // - streamMessage(model: string, message: string): Promise<ProviderResult<ReadableStream>>
  
  // TODO: Implement retry mechanisms
  // - Exponential backoff for failed requests
  // - Configurable retry limits per provider
  // - Jitter to prevent thundering herd problems
  // - Retry only on specific error types (network, rate limits)
  
  // TODO: Implement circuit breakers
  // - Track failure rates per provider
  // - Automatically disable failing providers temporarily
  // - Gradual recovery with health checks
  // - Configurable thresholds and timeouts