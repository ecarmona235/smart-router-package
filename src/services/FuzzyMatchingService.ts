export class FuzzyMatchingService {
  private llmProviders: Map<string, any>; // Will be passed from RouterClient
  private mediaProviders: Map<string, any>; // Will be passed from RouterClient

  constructor(
    llmProviders: Map<string, any>,
    mediaProviders: Map<string, any>
  ) {
    this.llmProviders = llmProviders;
    this.mediaProviders = mediaProviders;
  }

  /**
   * Normalize provider names for matching
   */
  normalizeProviderName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove spaces, hyphens, etc.
      .trim();
  }

  /**
   * Find closest provider using fuzzy matching against API data only
   */
  findClosestProvider(userInput: string): string | null {
    const normalizedInput = this.normalizeProviderName(userInput);
    let bestMatch: string | null = null;
    let bestScore = Infinity;
    
    // Check against actual API provider names from LLM data
    for (const [apiProviderName] of this.llmProviders) {
      const normalizedApi = this.normalizeProviderName(apiProviderName);
      const distance = this.levenshteinDistance(normalizedInput, normalizedApi);
      
      if (distance < bestScore && distance <= 2) { // Allow 2 character differences
        bestScore = distance;
        bestMatch = apiProviderName;
      }
    }
    
    // Also check media providers
    for (const [apiProviderName] of this.mediaProviders) {
      const normalizedApi = this.normalizeProviderName(apiProviderName);
      const distance = this.levenshteinDistance(normalizedInput, normalizedApi);
      
      if (distance < bestScore && distance <= 2) { // Allow 2 character differences
        bestScore = distance;
        bestMatch = apiProviderName;
      }
    }
    
    return bestMatch;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1: string, str2: string): number {
    if (str1.length === 0) return str2.length;
    if (str2.length === 0) return str1.length;
    
    // Initialize matrix with explicit typing to avoid undefined errors
    const matrix: number[][] = [];
    for (let j = 0; j <= str2.length; j++) {
      const row: number[] = new Array(str1.length + 1).fill(0);
      matrix[j] = row;
    }
    
    // Fill first row and column
    for (let i = 0; i <= str1.length; i++) {
      matrix[0]![i] = i;
    }
    for (let j = 0; j <= str2.length; j++) {
      matrix[j]![0] = j;
    }
    
    // Fill rest of matrix
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        const currentRow = matrix[j]!;
        const prevRow = matrix[j - 1]!;
        currentRow[i] = Math.min(
          currentRow[i - 1]! + 1,
          prevRow[i]! + 1,
          prevRow[i - 1]! + cost
        );
      }
    }
    
    return matrix[str2.length]![str1.length]!;
  }

  /**
   * Resolve provider name using fuzzy matching against API data
   */
  resolveProviderName(userInput: string): string | null {
    return this.findClosestProvider(userInput);
  }
}
