import { useState, useEffect, useCallback } from "react";
import { invoke } from '@tauri-apps/api/core';
import { Check, Trash2, ChevronRight, Edit3 } from "lucide-react";

import {
    readSettings,
    addOrUpdateModel,
    removeModel,
    setDefaultModel,
    SETTINGS_UPDATED_EVENT,
} from "../../../core/storage/repo";

import { providerRegistry } from "../../../core/providers/registry";
import type { ProviderCredential, Model } from "../../../core/storage/schemas";
import { BottomMenu, MenuButton } from "../../components/BottomMenu";

export function ModelsPage() {
    const [providers, setProviders] = useState<ProviderCredential[]>([]);
    const [models, setModels] = useState<Model[]>([]);
    const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<Model | null>(null); 
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editorModel, setEditorModel] = useState<Model | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    const loadData = useCallback(async () => {
        const settings = await readSettings();
        setProviders(settings.providerCredentials);
        setModels(settings.models);
        setDefaultModelId(settings.defaultModelId);
    }, []);

    useEffect(() => {
        loadData();
        (window as any).__openAddModel = () => openEditor();
        const listener = () => openEditor();
        window.addEventListener("models:add", listener);
        return () => {
            if ((window as any).__openAddModel) {
                delete (window as any).__openAddModel;
            }
            window.removeEventListener("models:add", listener);
        };
    }, [loadData]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handler = () => {
            loadData();
        };
        window.addEventListener(SETTINGS_UPDATED_EVENT, handler);
        return () => {
            window.removeEventListener(SETTINGS_UPDATED_EVENT, handler);
        };
    }, [loadData]);

    const handleSaveModel = useCallback(async () => {
        if (!editorModel) return;
        setValidationError(null);

        const providerCred = providers.find(p => p.providerId === editorModel.providerId && p.label === editorModel.providerLabel)
            ?? providers.find(p => p.providerId === editorModel.providerId);

        if (!providerCred) {
            setValidationError('Select a provider that has valid credentials');
            return;
        }

        const shouldVerify = providerCred && ["openai", "anthropic"].includes(providerCred.providerId);
        if (providerCred && shouldVerify) {
            try {
                setIsVerifying(true);
                const name = editorModel.name.trim();
                if (!name) {
                    setValidationError('Model name required');
                    return;
                }
                let resp: { exists: boolean; error?: string } | undefined;
                try {
                    resp = await invoke<{ exists: boolean; error?: string }>('verify_model_exists', {
                        providerId: providerCred.providerId,
                        credentialId: providerCred.id,
                        model: name,
                    });
                } catch (err) {
                    console.warn('Invoke verify_model_exists failed, treating as undefined:', err);
                }
                console.log('Model verification response:', resp);
                if (!resp) {
                    setValidationError('Model verification unavailable (backend).');
                    return; // block save if backend missing per requirement
                }
                if (!resp.exists) {
                    setValidationError(resp.error || 'Model not found on provider');
                    return;
                }
            } catch (e: any) {
                setValidationError(e?.message || 'Verification failed');
                return;
            } finally {
                setIsVerifying(false);
            }
        }
        setIsSaving(true);
        try {
            await addOrUpdateModel({
                ...editorModel,
                providerId: providerCred.providerId,
                providerLabel: providerCred.label,
            });
            await loadData();
            setIsEditorOpen(false);
            setEditorModel(null);
        } finally {
            setIsSaving(false);
        }
    }, [editorModel, providers]);

    const handleDeleteModel = useCallback(async (id: string) => {
        setIsDeleting(true);
        try {
            await removeModel(id);
            await loadData();
            setSelectedModel(null);
        } finally {
            setIsDeleting(false);
        }
    }, []);

    const handleSetDefaultModel = useCallback(async (id: string) => {
        await setDefaultModel(id);
        await loadData();
        setSelectedModel(null);
    }, []);

    const openEditor = (model?: Model) => {
        const firstProvider = providers[0];
        const firstRegistryProvider = providerRegistry[0];

        const newModel: Model = model || ({
            id: crypto.randomUUID(),
            name: "",
            displayName: "",
            providerId: firstProvider?.providerId || firstRegistryProvider?.id || "",
            providerLabel: firstProvider?.label || firstRegistryProvider?.name || ""
        } as Model);
        
        console.log('Opening editor with model:', newModel);
        console.log('Available providers:', providers);
        
        setEditorModel(newModel);
        setIsEditorOpen(true);
        setSelectedModel(null);
    };

    useEffect(() => {
        if (!isEditorOpen || !editorModel) return;
        if (providers.length === 0) return;

        const hasMatch = providers.some(
            (p) => p.providerId === editorModel.providerId && p.label === editorModel.providerLabel
        );

        if (!hasMatch) {
            const fallback = providers[0];
            setEditorModel({
                ...editorModel,
                providerId: fallback.providerId,
                providerLabel: fallback.label,
            });
        }
    }, [providers, isEditorOpen, editorModel]);

    const closeEditor = () => {
        setIsEditorOpen(false);
        setEditorModel(null);
    };

    return (
        <div className="flex h-full flex-col">
            {/* List (TopNav handles title/back) */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {models.length === 0 && (
                    <div className="mt-8 text-center text-sm text-white/50">No models yet. Add one.</div>
                )}
                {models.map(model => {
                    const isDefault = model.id === defaultModelId;
                    const providerInfo = providers.find(p => p.providerId === model.providerId);
                    console.log({model, providerInfo});
                    return (
                        <button
                            key={model.id}
                            onClick={() => setSelectedModel(model)}
                            className={`group w-full rounded-xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-white/20 active:scale-[0.99] ${isDefault ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="truncate text-sm font-medium text-white">{model.displayName || model.name}</span>
                                        {isDefault && (
                                            <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                                                <Check className="h-3 w-3" />
                                                DEFAULT
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/50">
                                        <code className="rounded bg-black/40 px-1 py-[1px] font-mono text-[10px]">{model.name}</code>
                                        <span className="opacity-40">•</span>
                                        <span className="truncate">{model.providerLabel || providerInfo?.label}</span>
                                    </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60 transition" />
                            </div>
                        </button>
                    );
                })}
            </div>


            {/* Action Sheet */}
            <BottomMenu
                isOpen={!!selectedModel}
                onClose={() => setSelectedModel(null)}
                includeExitIcon={false}
                title={selectedModel?.displayName || 'Model'}
            >
                {selectedModel && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-white">{selectedModel.displayName || selectedModel.name}</p>
                                <p className="mt-0.5 truncate text-[11px] text-white/50">{selectedModel.name}</p>
                            </div>
                            {selectedModel.id === defaultModelId && (
                                <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 flex items-center gap-1"><Check className="h-3 w-3" /> Default</span>
                            )}
                        </div>

                        {selectedModel.id !== defaultModelId && (
                            <MenuButton
                                icon={Check}
                                title="Set as Default"
                                description="Use this model by default"
                                onClick={() => handleSetDefaultModel(selectedModel.id)}
                                color="from-emerald-500 to-emerald-600"
                            />
                        )}

                        <MenuButton
                            icon={Edit3}
                            title="Edit"
                            description="Change model settings"
                            onClick={() => openEditor(selectedModel)}
                            color="from-indigo-500 to-blue-600"
                        />

                        <MenuButton
                            icon={Trash2}
                            title={isDeleting ? 'Deleting...' : 'Delete'}
                            description="Remove this model"
                            onClick={() => handleDeleteModel(selectedModel.id)}
                            disabled={isDeleting}
                            color="from-rose-500 to-red-600"
                        />
                    </div>
                )}
            </BottomMenu>

            {/* Editor Bottom Sheet */}
            <BottomMenu
                isOpen={isEditorOpen}
                onClose={closeEditor}
                includeExitIcon={false}
                title={editorModel?.displayName ? 'Edit Model' : 'Add Model'}
            >
                {editorModel && (
                    <div className="space-y-4 pb-2">
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-white/70">Display Name</label>
                            <input
                                type="text"
                                value={editorModel.displayName}
                                onChange={(e) => setEditorModel({ ...editorModel, displayName: e.target.value })}
                                placeholder="GPT-4 Turbo"
                                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-white/70">Model Name</label>
                            <input
                                type="text"
                                value={editorModel.name}
                                onChange={(e) => setEditorModel({ ...editorModel, name: e.target.value })}
                                placeholder="gpt-4-turbo-preview"
                                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
                            />
                            {validationError && (
                                <div className="mt-1 rounded-md border border-red-400/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-200">{validationError}</div>
                            )}
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-white/70">Provider</label>
                            {providers.length === 0 ? (
                                <div className="w-full rounded-lg border border-orange-400/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">
                                    No providers configured. Add a provider first.
                                </div>
                            ) : (
                                <select
                                    value={(editorModel.providerId + '|' + editorModel.providerLabel) || ''}
                                    onChange={(e) => {
                                        console.log('Provider changed to:', e.target.value);
                                        const [providerId, providerLabel] = e.target.value.split('|');
                                        const selectedProvider = providers.find(p => p.providerId === providerId && p.label === providerLabel)
                                            ?? providers.find(p => p.providerId === providerId);
                                        console.log('Selected provider:', selectedProvider);
                                        
                                        setEditorModel({
                                            ...editorModel,
                                            providerId: providerId,
                                            providerLabel: selectedProvider?.label ?? providerLabel
                                        });
                                    }}
                                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
                                >
                                    {providers.map(provider => {
                                        const registryInfo = providerRegistry.find(p => p.id === provider.providerId);
                                        return (
                                            <option key={provider.id} value={`${provider.providerId}|${provider.label}`} className="bg-black">
                                                {provider.label} ({registryInfo?.name || provider.providerId})
                                            </option>
                                        );
                                    })}
                                </select>
                            )}
                        </div>
                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={closeEditor}
                                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveModel}
                                disabled={isSaving || isVerifying || !editorModel.name}
                                className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/60 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isVerifying ? 'Verifying...' : isSaving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                )}
            </BottomMenu>
        </div>
    );
}
