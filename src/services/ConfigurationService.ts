export interface ModelSelectionSettings {
  cheapest: boolean;
  accurate: boolean;
  middle: boolean;
  rotating: boolean;
}

export type SelectionStrategy = 'cheapest' | 'accurate' | 'middle';

export class ConfigurationService {
  private modelSelection: ModelSelectionSettings;
  private maxAge: number;
  private staleCleanUp: boolean;

  constructor(
    userConfig: Partial<ModelSelectionSettings> = {},
    maxAge: number = 168,
    staleCleanUp: boolean = true
  ) {
    this.maxAge = maxAge;
    this.staleCleanUp = staleCleanUp;
    
    // Initialize with defaults: middle + rotating
    this.modelSelection = {
      cheapest: false,
      accurate: false,
      middle: true,
      rotating: true
    };
    
    // Apply user configuration
    this.setModelSelection(userConfig);
  }

  /**
   * Set model selection configuration
   * @param settings - Partial settings to update
   * @throws Error if both cheapest and accurate are set to true
   */
  setModelSelection(settings: Partial<ModelSelectionSettings>): void {
    // Validate: only one of cheapest/accurate can be true
    if (settings.cheapest && settings.accurate) {
      throw new Error('Cannot set both cheapest and accurate to true. Only one can be enabled.');
    }
    
    // Auto-set middle if both cheapest and accurate are false
    if (settings.cheapest === false && settings.accurate === false) {
      settings.middle = true;
    }
    
    // Apply the settings
    this.modelSelection = { ...this.modelSelection, ...settings };
    
    console.log('Model selection updated:', this.modelSelection);
  }

  /**
   * Get current model selection configuration
   */
  getModelSelection(): ModelSelectionSettings {
    return { ...this.modelSelection };
  }

  /**
   * Get the active selection strategy
   */
  getSelectionStrategy(): SelectionStrategy {
    if (this.modelSelection.cheapest) return 'cheapest';
    if (this.modelSelection.accurate) return 'accurate';
    return 'middle'; // Default fallback
  }

  /**
   * Check if rotating is enabled
   */
  isRotatingEnabled(): boolean {
    return this.modelSelection.rotating;
  }

  /**
   * Set individual model selection options
   */
  setCheapest(enabled: boolean): void {
    this.setModelSelection({ cheapest: enabled });
  }

  setAccurate(enabled: boolean): void {
    this.setModelSelection({ accurate: enabled });
  }

  setMiddle(enabled: boolean): void {
    this.setModelSelection({ middle: enabled });
  }

  setRotating(enabled: boolean): void {
    this.modelSelection.rotating = enabled;
    console.log(`Provider rotation ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current max age configuration
   */
  getMaxAge() {
    return this.maxAge;
  }



  /**
   * Check if stale cleanup is enabled
   */
  isStaleCleanUpEnabled() {
    return this.staleCleanUp;
  }

  /**
   * Set max age configuration
   */
  setMaxAge(maxAge: number): void {
    if (maxAge <= 0) {
      throw new Error('maxAge must be greater than 0');
    }
    this.maxAge = maxAge;
    console.log(`Max age updated to ${maxAge} hours`);
  }



  /**
   * Set stale cleanup configuration
   */
  setStaleCleanUp(enabled: boolean): void {
    this.staleCleanUp = enabled;
    console.log(`Stale cleanup ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if data is stale based on current configuration
   */
  isDataStale(lastInitialization: number, maxAgeHours?: number): boolean {
    const ageToUse = maxAgeHours ?? this.maxAge;
    const hoursSinceUpdate = (Date.now() - lastInitialization) / (1000 * 60 * 60);
    return hoursSinceUpdate > ageToUse;
  }

  /**
   * Get data health information
   */
  getDataHealth(lastInitialization: number) {
    const age = Date.now() - lastInitialization;
    const ageHours = age / (1000 * 60 * 60);
    
    return {
      lastUpdate: new Date(lastInitialization),
      ageHours: Math.round(ageHours * 100) / 100,
      isStale: ageHours > this.maxAge,
      status: ageHours > this.maxAge ? 'stale' as const : 'fresh' as const
    };
  }
}
