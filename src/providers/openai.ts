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

  async generateImage(
    model: string, 
    prompt: string, 
    options?: { size?: string; count?: number }
  ): Promise<ProviderResult<string>> {
    try {
      const response = await this.client.images.generate({
        model: model,
        prompt: prompt,
        n: options?.count || 1, // Generate 1 image by default
        size: options?.size || '1024x1024', // Default size
      });

      // Handle different response structures
      let imageUrl = '';
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const imageData = response.data[0];
        
        // Handle different response formats
        if (imageData.url) {
          imageUrl = imageData.url;
        } else if (imageData.b64_json) {
          // Convert base64 to data URL if needed
          imageUrl = `data:image/png;base64,${imageData.b64_json}`;
        } else if (typeof imageData === 'string') {
          imageUrl = imageData;
        } else {
          throw new Error('Unexpected image response format');
        }
      } else {
        throw new Error('No image data received');
      }

      return {
        success: true,
        data: imageUrl,
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

  async editImage(
    model: string,
    prompt: string,
    imagePath: string,
    maskPath?: string
  ): Promise<ProviderResult<string>> {
    try {
      // Convert file paths to File objects for OpenAI API
      const imageFile = await this.pathToFile(imagePath);
      const maskFile = maskPath ? await this.pathToFile(maskPath) : undefined;

      const response = await this.client.images.edit({
        model: model,
        prompt: prompt,
        image: imageFile,
        mask: maskFile,
        n: 1,
        // Note: OpenAI's edit API automatically matches original image dimensions
        // No size parameter needed as it preserves original dimensions
      });

      // Handle response similar to generateImage
      let imageUrl = '';
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const imageData = response.data[0];
        
        if (imageData.url) {
          imageUrl = imageData.url;
        } else if (imageData.b64_json) {
          imageUrl = `data:image/png;base64,${imageData.b64_json}`;
        } else if (typeof imageData === 'string') {
          imageUrl = imageData;
        } else {
          throw new Error('Unexpected edited image response format');
        }
      } else {
        throw new Error('No edited image data received');
      }

      return {
        success: true,
        data: imageUrl,
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

  // TODO: add user choice for voice in client settings for prefered voice vs random vs default voice
  // const voices = [
  //   'alloy',   // Balanced, neutral
  //   'echo',    // Warm, deep
  //   'fable',   // British accent
  //   'onyx',    // Deep, authoritative
  //   'nova',    // Bright, warm
  //   'shimmer'  // Soft, gentle
  // ];
  
  async speechToText(
    model: string,
    audioPath: string
  ): Promise<ProviderResult<string>> {
    try {
      const audioFile = await this.pathToFile(audioPath);
      const response = await this.client.audio.transcriptions.create({
        model: model,
        file: audioFile,
      });
      return {
        success: true,
        data: response.text,
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

  // async speechToTextStream(
  //   model: string,
  //   audioPath: string
  // ): Promise<ProviderResult<ReadableStream>> {
  //   try {
  //     const audioFile = await this.pathToFile(audioPath);
  //     const response = await this.client.audio.transcriptions.create({
  //       model: model,
  //       file: audioFile,
  //       response_format: 'verbose_json',
  //       timestamp_granularities: ['word']
  //     });

  //     // For streaming transcription, we need to handle the response differently
  //     // OpenAI's transcription API doesn't support true streaming yet
  //     // This returns the full transcription with timestamps
  //     if (response.text) {
  //       // Convert to a readable stream for consistency
  //       const stream = new ReadableStream({
  //         start(controller) {
  //           controller.enqueue(new TextEncoder().encode(response.text));
  //           controller.close();
  //         }
  //       });

  //       return {
  //         success: true,
  //         data: stream,
  //         provider: this.providerName,
  //         model: model,
  //       };
  //     } else {
  //       throw new Error('No transcription received');
  //     }
  //   } catch (error) {
  //     return {
  //       success: false,
  //       error: error instanceof Error ? error.message : 'Unknown error',
  //       provider: this.providerName,
  //       model: model,
  //     };
  //   }
  // }

    
  async textToSpeech(
    model: string,
    text: string,
    options?: { voice?: string; speed?: number }
  ): Promise<ProviderResult<string>> {
    try {
      const response = await this.client.audio.speech.create({
        model: model,
        input: text,
        voice: options?.voice || 'alloy',
        speed: options?.speed || 1.0,
      });

      // OpenAI TTS returns audio data directly, not a URL
      // We need to handle the audio buffer or convert it
      let audioData = '';
      
      if (response.body) {
        // Convert the readable stream to buffer
        const chunks: Buffer[] = [];
        for await (const chunk of response.body) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        // Convert to base64 data URL for easy handling
        audioData = `data:audio/mp3;base64,${buffer.toString('base64')}`;
      } else {
        throw new Error('No audio data received');
      }

      return {
        success: true,
        data: audioData,
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

  // async textToSpeechStream(
  //   model: string,
  //   text: string,
  //   options?: { voice?: string; speed?: number }
  // ): Promise<ProviderResult<ReadableStream>> {
  //   try {
  //     const response = await this.client.audio.speech.create({
  //       model: model,
  //       input: text,
  //       voice: options?.voice || 'alloy',
  //       speed: options?.speed || 1.0,
  //     });

  //     if (response.body) {
  //       return {
  //         success: true,
  //         data: response.body, // Return the actual stream
  //         provider: this.providerName,
  //         model: model,
  //       };
  //     } else {
  //       throw new Error('No audio stream received');
  //     }
  //   } catch (error) {
  //     return {
  //       success: false,
  //       error: error instanceof Error ? error.message : 'Unknown error',
  //       provider: this.providerName,
  //       model: model,
  //     };
  //   }
  // }


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
          provider: this.providerName,
          model: model,
        };
      } else {
        throw new Error('No embedding data received');
      }
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
    return ['text', 'text-to-image', 'edit-image', 'speech-to-text', 'text-to-speech', 'embedding']; // OpenAI supports text, image, audio, and embeddings
  }

  /**
   * Convert a file path to a File object for OpenAI API.
   * Handles both local file paths and URLs.
   */
  private async pathToFile(filePath: string): Promise<File> {
    try {
      // Check if it's a URL
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        const response = await fetch(filePath);
        const blob = await response.blob();
        const fileName = filePath.split('/').pop() || 'image.png';
        return new File([blob], fileName, { type: blob.type });
      }

      // For local file paths, we need to read the file
      // This is a Node.js environment, so we'll use fs
      const fs = await import('fs/promises');
      const buffer = await fs.readFile(filePath);
      
      // Determine MIME type based on file extension
      const ext = filePath.split('.').pop()?.toLowerCase();
      let mimeType = 'image/png'; // default
      
      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'gif') mimeType = 'image/gif';
      else if (ext === 'webp') mimeType = 'image/webp';
      
      const fileName = filePath.split('/').pop() || 'image.png';
      return new File([buffer], fileName, { type: mimeType });
    } catch (error) {
      throw new Error(`Failed to convert file path to File object: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}