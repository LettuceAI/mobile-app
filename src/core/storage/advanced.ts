import { storageBridge } from "./files";
import { readSettings } from "./repo";

export interface AdvancedSettings {
    summarisationModelId?: string;
    creationHelperEnabled?: boolean;
    creationHelperModelId?: string;
    dynamicMemory?: {
        enabled: boolean;
        summaryMessageInterval: number;
        maxEntries: number;
    };
}

/**
 * Read the current advanced settings
 */
export async function readAdvancedSettings(): Promise<AdvancedSettings> {
    const settings = await readSettings();
    return settings.advancedSettings || {};
}

/**
 * Update the entire advanced settings object
 */
export async function updateAdvancedSettings(settings: AdvancedSettings): Promise<void> {
    await storageBridge.settingsSetAdvanced(settings);
}

/**
 * Update a single field in advanced settings
 */
export async function updateAdvancedSetting<K extends keyof AdvancedSettings>(
    key: K,
    value: AdvancedSettings[K]
): Promise<void> {
    const current = await readAdvancedSettings();
    const newSettings: AdvancedSettings = {
        ...current,
        [key]: value,
    };
    await storageBridge.settingsSetAdvanced(newSettings);
}
