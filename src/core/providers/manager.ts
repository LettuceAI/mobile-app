import { getProvider } from "./registry";
import type { ProviderConfig } from "./types";
import { readSettings, addOrUpdateProviderCredential } from "../storage/repo";
import type { ProviderCredential } from "../storage/schemas";
import { getCachedModels, updateModelsCache } from "../storage/modelsCache";

const MODELS_TTL = 6 * 60 * 60 * 1000;

export class ProviderManager {
  async listCredentials(): Promise<ProviderCredential[]> {
    const s = await readSettings();
    return s.providerCredentials;
  }

  async getCredential(credId: string): Promise<ProviderCredential | undefined> {
    const s = await readSettings();
    return s.providerCredentials.find((c) => c.id === credId);
  }

  ensureConfig(cred: ProviderCredential): ProviderConfig {
    const reg = getProvider(cred.providerId);
    const credId = cred.id;
    return {
      baseUrl: cred.baseUrl || reg?.defaults?.baseUrl,
      apiKeyRef: cred.apiKeyRef ? { ...cred.apiKeyRef, credId: cred.apiKeyRef.credId ?? credId } : undefined,
      headers: cred.headers,
      defaultModel: cred.defaultModel,
    };
  }

  async listModels(cred: ProviderCredential, forceRefresh = false): Promise<string[]> {
    const reg = getProvider(cred.providerId);
    if (!reg) throw new Error("Unknown provider");
    const provider = reg.make();
    if (!forceRefresh) {
      const cached = await getCachedModels(cred.id, MODELS_TTL);
      if (cached && cached.length) return cached;
    }
    const models = await provider.listModels(this.ensureConfig(cred));
    if (models?.length) await updateModelsCache(cred.id, models);
    return models;
  }

  async chooseModel(cred: ProviderCredential): Promise<string> {
    if (cred.defaultModel) return cred.defaultModel;
    const models = await this.listModels(cred).catch(() => []);
    if (models.length) return models[0]!;
    return "";
  }

  async saveCredential(cred: ProviderCredential): Promise<ProviderCredential> {
    return addOrUpdateProviderCredential(cred);
  }
}

export const providerManager = new ProviderManager();

