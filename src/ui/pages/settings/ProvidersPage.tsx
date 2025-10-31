import { useEffect } from "react";
import { Trash2, ChevronRight, Edit3, EthernetPort } from "lucide-react";
import type { ProviderCapabilitiesCamel } from "../../../core/providers/capabilities";
import { BottomMenu, MenuButton } from "../../components/BottomMenu";
import { useProvidersPageController } from "./hooks/useProvidersPageController";

export function ProvidersPage() {
  const {
    state: {
      providers,
      selectedProvider,
      isEditorOpen,
      editorProvider,
      apiKey,
      isSaving,
      isDeleting,
      validationError,
      capabilities,
    },
    openEditor,
    closeEditor,
    setSelectedProvider,
    setApiKey,
    setValidationError,
    updateEditorProvider,
    handleSaveProvider,
    handleDeleteProvider,
  } = useProvidersPageController();

  useEffect(() => {
    (window as any).__openAddProvider = () => openEditor();
    const listener = () => openEditor();
    window.addEventListener("providers:add", listener);
    return () => {
      if ((window as any).__openAddProvider) delete (window as any).__openAddProvider;
      window.removeEventListener("providers:add", listener);
    };
  }, [openEditor]);

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
          const cap: ProviderCapabilitiesCamel | undefined = capabilities.find(p => p.id === provider.providerId);
          return (
            <button
              key={provider.id}
              onClick={() => setSelectedProvider(provider)}
              className="group w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{provider.label || cap?.name}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/50">
                    <span className="truncate">{cap?.name}</span>
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
              <p className="truncate text-sm font-medium text-white">{selectedProvider.label || capabilities.find(p => p.id === selectedProvider.providerId)?.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-white/50">{capabilities.find(p => p.id === selectedProvider.providerId)?.name}</p>
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
              onClick={() => void handleDeleteProvider(selectedProvider.id)}
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
                  const providerId = e.target.value;
                  const apiKeyRef = editorProvider.apiKeyRef
                    ? { ...editorProvider.apiKeyRef, providerId, credId: editorProvider.id }
                    : { providerId, key: "apiKey", credId: editorProvider.id };
                  updateEditorProvider({
                    providerId,
                    apiKeyRef,
                  });
                  setValidationError(null);
                }}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
              >
                {capabilities.map(p => (
                  <option key={p.id} value={p.id} className="bg-black">{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-white/70">Label</label>
              <input
                type="text"
                value={editorProvider.label}
                onChange={(e) => updateEditorProvider({ label: e.target.value })}
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
                  updateEditorProvider({ baseUrl: e.target.value || undefined });
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
                onClick={() => void handleSaveProvider()}
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
