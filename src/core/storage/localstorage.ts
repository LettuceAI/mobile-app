export enum LocalStorageKey {
  ONBOARDING_COMPLETED = "lettuceai_onboarding_completed",
  ONBOARDING_SKIPPED = "lettuceai_onboarding_skipped", 
  PROVIDER_SETUP_COMPLETED = "lettuceai_provider_setup_completed",
  MODEL_SETUP_COMPLETED = "lettuceai_model_setup_completed",
  TOOLTIP_PREFIX = "lettuceai_tooltip_",
  THEME = "lettuceai_theme",
};

export type LocalStorageValue = string | boolean | number | null;

export class LocalStorageManager {
  static set(key: LocalStorageKey | string, value: LocalStorageValue): void {
    try {
      const stringValue = value === null ? "" : String(value);
      localStorage.setItem(key, stringValue);
    } catch (error) {
      console.warn("Failed to set localStorage item:", key, error);
    }
  }

  static get(key: LocalStorageKey | string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn("Failed to get localStorage item:", key, error);
      return null;
    }
  }

  static getBoolean(key: LocalStorageKey | string): boolean {
    const value = this.get(key);
    return value === "true";
  }

  static setBoolean(key: LocalStorageKey | string, value: boolean): void {
    this.set(key, value.toString());
  }

  static remove(key: LocalStorageKey | string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn("Failed to remove localStorage item:", key, error);
    }
  }

  static has(key: LocalStorageKey | string): boolean {
    return this.get(key) !== null;
  }

  static clearAppData(): void {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("lettuceai_")) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      console.log(`Cleared ${keysToRemove.length} localStorage items`);
    } catch (error) {
      console.warn("Failed to clear app localStorage data:", error);
    }
  }

  static getAppData(): Record<string, string | null> {
    const appData: Record<string, string | null> = {};
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("lettuceai_")) {
          appData[key] = localStorage.getItem(key);
        }
      }
    } catch (error) {
      console.warn("Failed to get app localStorage data:", error);
    }
    
    return appData;
  }
}

export const localStorage_ = {
  isOnboardingCompleted: () => LocalStorageManager.getBoolean(LocalStorageKey.ONBOARDING_COMPLETED),
  setOnboardingCompleted: (completed: boolean = true) => LocalStorageManager.setBoolean(LocalStorageKey.ONBOARDING_COMPLETED, completed),
  
  isOnboardingSkipped: () => LocalStorageManager.getBoolean(LocalStorageKey.ONBOARDING_SKIPPED),
  setOnboardingSkipped: (skipped: boolean = true) => LocalStorageManager.setBoolean(LocalStorageKey.ONBOARDING_SKIPPED, skipped),
  
  isProviderSetupCompleted: () => LocalStorageManager.getBoolean(LocalStorageKey.PROVIDER_SETUP_COMPLETED),
  setProviderSetupCompleted: (completed: boolean = true) => LocalStorageManager.setBoolean(LocalStorageKey.PROVIDER_SETUP_COMPLETED, completed),
  
  isModelSetupCompleted: () => LocalStorageManager.getBoolean(LocalStorageKey.MODEL_SETUP_COMPLETED),
  setModelSetupCompleted: (completed: boolean = true) => LocalStorageManager.setBoolean(LocalStorageKey.MODEL_SETUP_COMPLETED, completed),
  
  hasSeenTooltip: (tooltipId: string) => LocalStorageManager.getBoolean(`${LocalStorageKey.TOOLTIP_PREFIX}${tooltipId}`),
  setTooltipSeen: (tooltipId: string, seen: boolean = true) => LocalStorageManager.setBoolean(`${LocalStorageKey.TOOLTIP_PREFIX}${tooltipId}`, seen),
  
  getTheme: () => LocalStorageManager.get(LocalStorageKey.THEME) || "light",
  setTheme: (theme: "light" | "dark") => LocalStorageManager.set(LocalStorageKey.THEME, theme),
  
  clearAll: () => LocalStorageManager.clearAppData(),
  getAll: () => LocalStorageManager.getAppData(),
};
