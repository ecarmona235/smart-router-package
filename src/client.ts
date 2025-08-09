export type RouterClientOptions = {
    AI_ANALYSIS_API?: string;
    fetchFn?: typeof fetch;
  };
  
  export class RouterClient {
    private readonly AI_ANALYSIS_API: string;
    private readonly fetchFn: typeof fetch;
  
    constructor(options: RouterClientOptions = {}) {
        if (typeof window !== "undefined") {
            throw new Error("AI Router is server-only. Do not use in the browser.");
        }
        const key = options.AI_ANALYSIS_API ?? process.env.AI_ANALYSIS_API;
        if (!key) throw new Error("Missing AI_ANALYSIS_API (or AI_ANALYSIS_API)");
        this.AI_ANALYSIS_API = key;
        this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    }
    
  
    async #getLLMAnalytics(): Promise<unknown> {
      try {
        const res = await this.fetchFn(`https://artificialanalysis.ai/api/v2/data/llms/models`, {
          method: "GET",
          headers: { "x-api-key": this.AI_ANALYSIS_API },
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      } catch (error) {
        console.error(error);
        throw error;
      }
    }

    async #getTTIAnalytics(): Promise<unknown> {
        try {
          const res = await this.fetchFn("https://artificialanalysis.ai/api/v2/data/media/text-to-image", {
            method: "GET",
            headers: { "x-api-key": this.AI_ANALYSIS_API },
          });
          if (!res.ok) throw new Error(`Request failed: ${res.status}`);
          return res.json();
        } catch (error) {
          console.error(error);
          throw error;
        }
    }

    async #getImageEditingAnalytics(): Promise<unknown> {
        try {
          const res = await this.fetchFn("https://artificialanalysis.ai/api/v2/data/media/image-editing", {
            method: "GET",
            headers: { "x-api-key": this.AI_ANALYSIS_API },
          });
          if (!res.ok) throw new Error(`Request failed: ${res.status}`);
          return res.json();
        } catch (error) {
          console.error(error);
          throw error;
        }
    }

    async #getTTSAnalytics(): Promise<unknown> {
        try {
          const res = await this.fetchFn("https://artificialanalysis.ai/api/v2/data/media/text-to-speech", {
            method: "GET",
            headers: { "x-api-key": this.AI_ANALYSIS_API },
          });
          if (!res.ok) throw new Error(`Request failed: ${res.status}`);
          return res.json();
        } catch (error) {
          console.error(error);
          throw error;
        }
    }

    async #getTTVAnalytics(): Promise<unknown> {
        try {
          const res = await this.fetchFn("https://artificialanalysis.ai/api/v2/data/media/text-to-video", {
            method: "GET",
            headers: { "x-api-key": this.AI_ANALYSIS_API },
          });
          if (!res.ok) throw new Error(`Request failed: ${res.status}`);
          return res.json();
        } catch (error) {
          console.error(error);
          throw error;
        }
    }

    async #getImageAnalytics(): Promise<unknown> {
        try {
          const res = await this.fetchFn("https://artificialanalysis.ai/api/v2/data/media/text-to-video", {
            method: "GET",
            headers: { "x-api-key": this.AI_ANALYSIS_API },
          });
          if (!res.ok) throw new Error(`Request failed: ${res.status}`);
          return res.json();
        } catch (error) {
          console.error(error);
          throw error;
        }
    }
  }