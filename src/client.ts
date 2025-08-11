export type RouterClientOptions = {
    AI_ANALYSIS_API?: string;
    fetchFn?: typeof fetch;
 };

  interface  LLMEvaluations {   
    artificial_analysis_intelligence_index: number;
    artificial_analysis_coding_index?: number;
    artificial_analysis_math_index?: number;
    mmlu_pro_index?: number;
    physics_knowledge_index?: number;
    human_level_evaluation_index?: number;
    live_code_benchmark_index?: number;
    science_code_benchmark_index?: number;
    math_benchmark_index?: number;
    aime_index?: number;
    aime_25_index?: number;
    image_benchmark_index?: number;
  }
  interface CleanLLMData {
    name: string;
    model_creator: string;
    evaluations: LLMEvaluations[];
    price_per_1M_input_tokens: number;
    price_per_1M_output_tokens: number;
    median_output_tokens_per_second: number;
    median_time_to_first_token: number;
  }

  interface MediaEvaluations {
    elo: number;
    rank: number;
    ci95: string;
    categories: {
      style_category: string;
      subject_matter_category: string;
      elo: number;
      ci95: string;
    }[];
  }

  interface CleanMediaData {
    name: string;
    model_creator_name: string;
    evaluations: MediaEvaluations[];
    // TODO: add the rest of the data
  }

  export class RouterClient {
    private readonly AI_ANALYSIS_API: string;
    private readonly fetchFn: typeof fetch;
    private llmData: CleanLLMData[] = [];
    constructor(options: RouterClientOptions = {}) {
        if (typeof window !== "undefined") {
            throw new Error("AI Router is server-only. Do not use in the browser.");
        }
        const key = options.AI_ANALYSIS_API ?? process.env.AI_ANALYSIS_API;
        if (!key) throw new Error("Missing AI_ANALYSIS_API (or AI_ANALYSIS_API)");
        this.AI_ANALYSIS_API = key;
        this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    }
    async initialize(): Promise<void> {
        this.llmData = await this.#getLLMAnalytics();
        console.log(this.llmData);
    }

    #extractLLMData(data: any): CleanLLMData[] {
      return data.map((item: any) => ({
        name: item.name,
        model_creator: item.model_creator.name,
        evaluations: item.evaluations,
        price_per_1M_input_tokens: item.price_per_1M_input_tokens,
        price_per_1M_output_tokens: item.price_per_1M_output_tokens,
        median_output_tokens_per_second: item.median_output_tokens_per_second,
        median_time_to_first_token: item.median_time_to_first_token,
      }));
    }
    async #getLLMAnalytics(): Promise<CleanLLMData[]> {
      try {
        const res = await this.fetchFn(`https://artificialanalysis.ai/api/v2/data/llms/models`, {
          method: "GET",
          headers: { "x-api-key": this.AI_ANALYSIS_API },
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data = await res.json();
        return this.#extractLLMData(data.data);
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