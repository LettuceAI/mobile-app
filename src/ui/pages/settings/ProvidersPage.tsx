import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2, ChevronRight, Edit3, EthernetPort } from "lucide-react";
import { readSettings, addOrUpdateProviderCredential, removeProviderCredential, SETTINGS_UPDATED_EVENT } from "../../../core/storage/repo";
import { providerRegistry } from "../../../core/providers/registry";
import { setSecret, getSecret } from "../../../core/secrets";
import type { ProviderCredential } from "../../../core/storage/schemas";
import { BottomMenu, MenuButton } from "../../components/BottomMenu";

type VerifyProviderApiKeyResult = {
  providerId: string;
  valid: boolean;
  status?: number;
  error?: string;
  details?: unknown;
};

export function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderCredential | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorProvider, setEditorProvider] = useState<ProviderCredential | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    const settings = await readSettings();
    setProviders(settings.providerCredentials);
  }, []);

  const openEditor = (provider?: ProviderCredential) => {
    const newId = crypto.randomUUID();
    const newProvider: ProviderCredential = provider || {
      id: newId,
      providerId: providerRegistry[0].id,
      label: "",
      apiKeyRef: { providerId: providerRegistry[0].id, key: "apiKey", credId: newId }
    } as ProviderCredential;
    setEditorProvider(newProvider);
    setIsEditorOpen(true);
    setSelectedProvider(null);
    setApiKey("");
    setValidationError(null);
    if (provider?.apiKeyRef) {
      const ref = { ...provider.apiKeyRef, credId: provider.id };
      getSecret(ref).then(key => setApiKey(key || ""));
    }
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditorProvider(null);
    setApiKey("");
    setValidationError(null);
  };

  useEffect(() => {
    loadProviders();
    (window as any).__openAddProvider = () => openEditor();
    const listener = () => openEditor();
    window.addEventListener("providers:add", listener);
    return () => {
      if ((window as any).__openAddProvider) delete (window as any).__openAddProvider;
      window.removeEventListener("providers:add", listener);
    };
  }, [loadProviders]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => loadProviders();
    window.addEventListener(SETTINGS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, handler);
  }, [loadProviders]);

  const handleSaveProvider = useCallback(async () => {
    if (!editorProvider) return;
    setValidationError(null);
    setIsSaving(true);
    try {
      const requiresVerification = ["openai", "anthropic", "openrouter"].includes(editorProvider.providerId);
      const trimmedKey = apiKey.trim();

      if (requiresVerification) {
        if (!trimmedKey) {
          setValidationError("API key required");
          return;
        }

        let verification: VerifyProviderApiKeyResult;
        try {
          verification = await invoke<VerifyProviderApiKeyResult>("verify_provider_api_key", {
            providerId: editorProvider.providerId,
            credentialId: editorProvider.id,
            apiKey: trimmedKey,
            baseUrl: editorProvider.baseUrl ?? null
          });
        } catch (error) {
          setValidationError(error instanceof Error ? error.message : String(error));
          return;
        }

        if (!verification.valid) {
          setValidationError(verification.error || "Invalid API key");
          return;
        }
      }

      if (editorProvider.apiKeyRef) {
        editorProvider.apiKeyRef.credId = editorProvider.id;
      }
      await addOrUpdateProviderCredential(editorProvider);
      if (editorProvider.apiKeyRef && trimmedKey) {
        await setSecret(editorProvider.apiKeyRef, trimmedKey);
      }
      await loadProviders();
      setIsEditorOpen(false);
      setEditorProvider(null);
      setApiKey("");
    } finally {
      setIsSaving(false);
    }
  }, [editorProvider, apiKey, loadProviders]);

  const handleDeleteProvider = useCallback(async (id: string) => {
    setIsDeleting(true);
    try {
      await removeProviderCredential(id);
      await loadProviders();
      setSelectedProvider(null);
    } finally {
      setIsDeleting(false);
    }
  }, []);

      const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
        <div className="flex h-64 flex-col items-center justify-center">
            <EthernetPort className="mb-3 h-12 w-12 text-white/20" />
            <h3 className="mb-1 text-lg font-medium text-white">No Providers yet</h3>
            <p className="mb-4 text-center text-sm text-white/50">
                Add and manage API providers for AI models
            </p>
            <button
                onClick={onCreate}
                className="rounded-full border border-emerald-400/40 bg-emerald-400/20 px-6 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/30 active:scale-[0.99]"
            >
                Add Provider
            </button>
        </div>
    );


  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {providers.length === 0 && (
          <EmptyState onCreate={() => openEditor()} />
        )}
        {providers.map(provider => {
          const registryInfo = providerRegistry.find(p => p.id === provider.providerId);
          return (
            <button
              key={provider.id}
              onClick={() => setSelectedProvider(provider)}
              className="group w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{provider.label || registryInfo?.name}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/50">
                    <span className="truncate">{registryInfo?.name}</span>
                    {provider.baseUrl && (
                      <>
                        <span className="opacity-40">•</span>
                        <span className="truncate max-w-[120px]">{provider.baseUrl.replace(/^https?:\/\//, '')}</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60 transition" />
              </div>
            </button>
          );
        })}
      </div>

      <BottomMenu
        isOpen={!!selectedProvider}
        onClose={() => setSelectedProvider(null)}
        title={selectedProvider?.label || 'Provider'}
      >
        {selectedProvider && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <p className="truncate text-sm font-medium text-white">{selectedProvider.label || providerRegistry.find(p => p.id === selectedProvider.providerId)?.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-white/50">{providerRegistry.find(p => p.id === selectedProvider.providerId)?.name}</p>
            </div>
            <MenuButton
              icon={Edit3}
              title="Edit"
              description="Change provider settings"
              onClick={() => openEditor(selectedProvider)}
              color="from-indigo-500 to-blue-600"
            />
            <MenuButton
              icon={Trash2}
              title={isDeleting ? 'Deleting...' : 'Delete'}
              description="Remove this provider"
              onClick={() => handleDeleteProvider(selectedProvider.id)}
              disabled={isDeleting}
              color="from-rose-500 to-red-600"
            />
          </div>
        )}
      </BottomMenu>

      <BottomMenu
        isOpen={isEditorOpen}
        onClose={closeEditor}
        title={editorProvider?.label ? 'Edit Provider' : 'Add Provider'}
      >
        {editorProvider && (
          <div className="space-y-4 pb-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-white/70">Provider Type</label>
              <select
                value={editorProvider.providerId}
                onChange={(e) => {
                  setEditorProvider({
                    ...editorProvider,
                    providerId: e.target.value,
                    apiKeyRef: { ...editorProvider.apiKeyRef!, providerId: e.target.value, credId: editorProvider.id }
                  });
                  setValidationError(null);
                }}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
              >
                {providerRegistry.map(p => (
                  <option key={p.id} value={p.id} className="bg-black">{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-white/70">Label</label>
              <input
                type="text"
                value={editorProvider.label}
                onChange={(e) => setEditorProvider({ ...editorProvider, label: e.target.value })}
                placeholder="My OpenAI Account"
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-white/70">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder="Enter your API key"
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-white/70">Base URL (optional)</label>
              <input
                type="url"
                value={editorProvider.baseUrl || ''}
                onChange={(e) => {
                  setEditorProvider({ ...editorProvider, baseUrl: e.target.value });
                  if (validationError) setValidationError(null);
                }}
                placeholder="https://api.openai.com"
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
              />
            </div>
            {validationError && (
              <p className="text-xs font-medium text-rose-300">{validationError}</p>
            )}
            <div className="flex gap-3 pt-1">
              <button
                onClick={closeEditor}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProvider}
                disabled={isSaving || !editorProvider.label}
                className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/60 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </BottomMenu>
    </div>
  );
}
