import { useState, useEffect, useCallback } from "react";
import { ChevronRight, Plus, Trash2, Play, Mic, Volume2, Loader2, Edit3 } from "lucide-react";

import {
    listAudioProviders,
    listUserVoices,
    upsertUserVoice,
    deleteUserVoice,
    upsertAudioProvider,
    deleteAudioProvider,
    listAudioModels,
    refreshProviderVoices,
    verifyAudioProvider,
    generateTtsPreview,
    playAudioFromBase64,
    designVoicePreview,
    createVoiceFromPreview,
    type AudioProvider,
    type AudioProviderType,
    type AudioModel,
    type UserVoice,
    type CachedVoice,
} from "../../../core/storage/audioProviders";

import { BottomMenu, MenuButton } from "../../components/BottomMenu";

export function VoicesPage() {
    const [providers, setProviders] = useState<AudioProvider[]>([]);
    const [userVoices, setUserVoices] = useState<UserVoice[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Voice editor state
    const [isVoiceEditorOpen, setIsVoiceEditorOpen] = useState(false);
    const [editingVoice, setEditingVoice] = useState<UserVoice | null>(null);

    // Provider editor state
    const [isProviderEditorOpen, setIsProviderEditorOpen] = useState(false);
    const [editingProvider, setEditingProvider] = useState<AudioProvider | null>(null);

    // Selection menu state
    const [selectedVoice, setSelectedVoice] = useState<UserVoice | null>(null);
    const [selectedProvider, setSelectedProvider] = useState<AudioProvider | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [loadedProviders, loadedVoices] = await Promise.all([
                listAudioProviders(),
                listUserVoices(),
            ]);
            setProviders(loadedProviders);
            setUserVoices(loadedVoices);
        } catch (e) {
            console.error("Failed to load voices data:", e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleCreateVoice = () => {
        setEditingVoice({
            id: "",
            providerId: providers[0]?.id ?? "",
            name: "",
            modelId: "",
            voiceId: "", // Not used but required by type
            prompt: "",
        });
        setIsVoiceEditorOpen(true);
    };

    const handleEditVoice = (voice: UserVoice) => {
        setEditingVoice({ ...voice });
        setIsVoiceEditorOpen(true);
        setSelectedVoice(null);
    };

    const handleDeleteVoice = async (id: string) => {
        try {
            await deleteUserVoice(id);
            await loadData();
            setSelectedVoice(null);
        } catch (e) {
            console.error("Failed to delete voice:", e);
        }
    };

    const handleCreateProvider = () => {
        setEditingProvider({
            id: "",
            providerType: "elevenlabs",
            label: "",
            apiKey: "",
        });
        setIsProviderEditorOpen(true);
    };

    const handleEditProvider = (provider: AudioProvider) => {
        setEditingProvider({ ...provider });
        setIsProviderEditorOpen(true);
        setSelectedProvider(null);
    };

    const handleDeleteProvider = async (id: string) => {
        try {
            await deleteAudioProvider(id);
            await loadData();
            setSelectedProvider(null);
        } catch (e) {
            console.error("Failed to delete provider:", e);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-white/40" />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col space-y-6">
            {/* Audio Providers Section */}
            <section>
                <div className="mb-2 flex items-center justify-between px-1">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-white/40">
                        Audio Providers
                    </h2>
                    <button
                        onClick={handleCreateProvider}
                        className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10"
                    >
                        <Plus className="h-3 w-3" />
                        Add
                    </button>
                </div>

                {providers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-8">
                        <Mic className="mb-2 h-8 w-8 text-white/20" />
                        <p className="text-sm text-white/50">No audio providers configured</p>
                        <p className="text-xs text-white/30">Add Gemini TTS or ElevenLabs to get started</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {providers.map((provider) => (
                            <button
                                key={provider.id}
                                onClick={() => setSelectedProvider(provider)}
                                className="group w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10">
                                        {provider.providerType === "gemini_tts" ? (
                                            <span className="text-xs">G</span>
                                        ) : (
                                            <span className="text-xs">11</span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate text-sm font-medium text-white">{provider.label}</p>
                                        <p className="text-xs text-white/50">
                                            {provider.providerType === "gemini_tts" ? "Gemini TTS" : "ElevenLabs"}
                                        </p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60" />
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {/* My Voices Section (Voice Designer) */}
            <section>
                <div className="mb-2 flex items-center justify-between px-1">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-white/40">
                        My Voices
                    </h2>
                    {providers.length > 0 && (
                        <button
                            onClick={handleCreateVoice}
                            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/10"
                        >
                            <Plus className="h-3 w-3" />
                            Create
                        </button>
                    )}
                </div>

                {userVoices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-8">
                        <Volume2 className="mb-2 h-8 w-8 text-white/20" />
                        <p className="text-sm text-white/50">No voices created yet</p>
                        <p className="text-xs text-white/30">
                            {providers.length > 0
                                ? "Create voices with custom prompts for your characters"
                                : "Add an audio provider first"}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {userVoices.map((voice) => {
                            const provider = providers.find(p => p.id === voice.providerId);
                            return (
                                <button
                                    key={voice.id}
                                    onClick={() => setSelectedVoice(voice)}
                                    className="group w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10">
                                            <Volume2 className="h-4 w-4 text-emerald-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="truncate text-sm font-medium text-white">{voice.name}</p>
                                            <p className="truncate text-xs text-white/50">
                                                {provider?.label} • {voice.prompt ? `"${voice.prompt.slice(0, 30)}..."` : "No prompt"}
                                            </p>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Voice Selection Menu */}
            <BottomMenu
                isOpen={!!selectedVoice}
                onClose={() => setSelectedVoice(null)}
                title={selectedVoice?.name || "Voice"}
            >
                {selectedVoice && (
                    <div className="space-y-4">
                        <MenuButton
                            icon={Edit3}
                            title="Edit"
                            description="Modify this voice"
                            onClick={() => handleEditVoice(selectedVoice)}
                            color="from-indigo-500 to-blue-600"
                        />
                        <MenuButton
                            icon={Trash2}
                            title="Delete"
                            description="Remove this voice"
                            onClick={() => void handleDeleteVoice(selectedVoice.id)}
                            color="from-rose-500 to-red-600"
                        />
                    </div>
                )}
            </BottomMenu>

            {/* Provider Selection Menu */}
            <BottomMenu
                isOpen={!!selectedProvider}
                onClose={() => setSelectedProvider(null)}
                title={selectedProvider?.label || "Provider"}
            >
                {selectedProvider && (
                    <div className="space-y-4">
                        <MenuButton
                            icon={Edit3}
                            title="Edit"
                            description="Modify provider settings"
                            onClick={() => handleEditProvider(selectedProvider)}
                            color="from-indigo-500 to-blue-600"
                        />
                        <MenuButton
                            icon={Trash2}
                            title="Delete"
                            description="Remove this provider"
                            onClick={() => void handleDeleteProvider(selectedProvider.id)}
                            color="from-rose-500 to-red-600"
                        />
                    </div>
                )}
            </BottomMenu>

            {/* Voice Editor (Voice Designer) */}
            <VoiceEditor
                isOpen={isVoiceEditorOpen}
                voice={editingVoice}
                providers={providers}
                onClose={() => {
                    setIsVoiceEditorOpen(false);
                    setEditingVoice(null);
                }}
                onSave={async (voice) => {
                    await upsertUserVoice(voice);
                    await loadData();
                    setIsVoiceEditorOpen(false);
                    setEditingVoice(null);
                }}
            />

            {/* Provider Editor */}
            <ProviderEditor
                isOpen={isProviderEditorOpen}
                provider={editingProvider}
                onClose={() => {
                    setIsProviderEditorOpen(false);
                    setEditingProvider(null);
                }}
                onSave={async (provider) => {
                    await upsertAudioProvider(provider);
                    await loadData();
                    setIsProviderEditorOpen(false);
                    setEditingProvider(null);
                }}
            />
        </div>
    );
}

interface VoiceEditorProps {
    isOpen: boolean;
    voice: UserVoice | null;
    providers: AudioProvider[];
    onClose: () => void;
    onSave: (voice: UserVoice) => Promise<void>;
}

function VoiceEditor({ isOpen, voice, providers, onClose, onSave }: VoiceEditorProps) {
    const [formData, setFormData] = useState<UserVoice | null>(null);
    const [models, setModels] = useState<AudioModel[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    // Track generated preview ID for creation
    const [generatedPreviewId, setGeneratedPreviewId] = useState<string | null>(null);
    const [textSample, setTextSample] = useState(
        "Hello! This is how I sound when speaking. I can read longer passages with warmth, clarity, and emotion so you can judge my tone and pace."
    );
    const [previewError, setPreviewError] = useState<string | null>(null);
    const minVoiceDesignChars = 100;

    useEffect(() => {
        if (isOpen) {
            if (voice) {
                setFormData({ ...voice });
            } else {
                // Initialize for NEW voice
                setFormData({
                    id: "",
                    providerId: providers.length > 0 ? providers[0].id : "",
                    name: "",
                    modelId: "",
                    voiceId: "",
                    prompt: ""
                });
            }
            setGeneratedPreviewId(null);
            setTextSample(
                "Hello! This is how I sound when speaking. I can read longer passages with warmth, clarity, and emotion so you can judge my tone and pace."
            );
            setPreviewError(null);
        }
    }, [isOpen, voice, providers]);

    // Load models when provider changes
    useEffect(() => {
        if (!formData?.providerId) return;
        const provider = providers.find((p) => p.id === formData.providerId);
        if (!provider) return;

        void (async () => {
            try {
                // If ElevenLabs and CREATING A NEW VOICE (no ID), load design models
                // If editing existing voice, load standard TTS models (voice is already created)
                let loadedModels: AudioModel[] = [];

                if (provider.providerType === "elevenlabs" && !formData.id) {
                    // For Voice Design, we don't show a model list anymore
                    loadedModels = [];
                    setModels([]);
                    // Clear modelId if it was set
                    if (formData.modelId) {
                        setFormData((f) => f ? { ...f, modelId: "" } : f);
                    }
                } else {
                    loadedModels = await listAudioModels(provider.providerType);
                    setModels(loadedModels);

                    // Set default model if not set
                    if (!formData.modelId && loadedModels.length > 0) {
                        setFormData((f) => f ? { ...f, modelId: loadedModels[0].id } : f);
                    }
                }
            } catch (e) {
                console.error("Failed to load models:", e);
            }
        })();
    }, [formData?.providerId, formData?.id, providers]);

    const handleSave = async () => {
        if (!formData || !formData.name.trim()) return;
        setIsSaving(true);
        try {
            // Logic for ElevenLabs Voice Design Creation
            let finalVoiceData = { ...formData };
            const provider = providers.find(p => p.id === formData.providerId);

            // If it's a NEW ElevenLabs voice, we need to finalize creation
            if (provider?.providerType === "elevenlabs" && !formData.id) {
                if (!generatedPreviewId) {
                    throw new Error("Please preview the voice first to generate it.");
                }

                const result = await createVoiceFromPreview(
                    formData.providerId,
                    formData.name,
                    generatedPreviewId,
                    formData.prompt || "" // voice description
                );

                // Update with the real voice ID from ElevenLabs
                finalVoiceData.voiceId = result.voiceId;
            }

            if (provider?.providerType === "gemini_tts" && !finalVoiceData.voiceId.trim()) {
                finalVoiceData.voiceId = "kore";
            }

            await onSave(finalVoiceData);
        } catch (e) {
            console.error("Failed to save voice:", e);
            // Show error notification/toast here if possible, for now console error
        } finally {
            setIsSaving(false);
        }
    };

    const handlePreview = async () => {
        console.log("handlePreview called. Provider:", formData?.providerId, "Model:", formData?.modelId, "Sample:", textSample);
        if (!formData?.providerId || !textSample.trim()) return;

        const provider = providers.find(p => p.id === formData.providerId);
        if (!provider) return;

        // Require modelId only for standard TTS (not voice design)
        const isVoiceDesign = provider.providerType === "elevenlabs" && !formData.id;
        if (!isVoiceDesign && !formData?.modelId) return;
        const trimmedSample = textSample.trim();
        if (isVoiceDesign && trimmedSample.length < minVoiceDesignChars) {
            setPreviewError(`Example text must be at least ${minVoiceDesignChars} characters for voice design.`);
            return;
        }

        setIsPlaying(true);
        try {
            setPreviewError(null);
            if (isVoiceDesign) {
                // Voice Design Preview (New Voice)
                const description = formData.prompt || "";
                console.log("Requesting Voice Design Preview...");

                // Note: We don't verify modelId here as design doesn't require selection
                const previews = await designVoicePreview(
                    formData.providerId,
                    trimmedSample,
                    description,
                    undefined, // No specific model ID needed
                    1 // Generate 1 preview
                );

                if (previews.length > 0) {
                    console.log("Got previews:", previews);
                    const preview = previews[0];
                    console.log("Setting generatedPreviewId:", preview.generatedVoiceId);
                    setGeneratedPreviewId(preview.generatedVoiceId);
                    playAudioFromBase64(preview.audioBase64, preview.mediaType);
                } else {
                    console.warn("No previews returned!");
                }
            } else {
                let resolvedVoiceId = formData.voiceId;
                if (provider.providerType === "elevenlabs" && (!resolvedVoiceId || resolvedVoiceId === formData.id)) {
                    const voices = await refreshProviderVoices(formData.providerId);
                    const match = voices.find((voice) => voice.name.trim().toLowerCase() === formData.name.trim().toLowerCase());
                    if (!match) {
                        throw new Error("Unable to resolve ElevenLabs voice ID. Please recreate the voice.");
                    }
                    resolvedVoiceId = match.voiceId;
                    const nextVoice = { ...formData, voiceId: resolvedVoiceId };
                    setFormData(nextVoice);
                    await upsertUserVoice(nextVoice);
                }
                // Standard TTS Preview (Existing Voice or Gemini)
                // Use the REAL voice ID stored in formData
                const response = await generateTtsPreview(
                    formData.providerId,
                    formData.modelId,
                    // For Gemini, we might need a placeholder if voiceId is empty (new config)
                    // But if it's existing, use the ID.
                    resolvedVoiceId || "preview",
                    textSample,
                    formData.prompt
                );
                playAudioFromBase64(response.audioBase64, response.format);
            }
        } catch (e) {
            console.error("TTS preview failed:", e);
        } finally {
            setIsPlaying(false);
        }
    };

    if (!formData) return null;
    const activeProvider = providers.find((p) => p.id === formData.providerId);
    const isVoiceDesign = activeProvider?.providerType === "elevenlabs" && !formData.id;
    const requiresVoiceId = activeProvider?.providerType === "elevenlabs" && !isVoiceDesign;
    const sampleLength = textSample.trim().length;
    const previewDisabled =
        isPlaying ||
        !formData.providerId ||
        !textSample.trim() ||
        (isVoiceDesign && sampleLength < minVoiceDesignChars) ||
        (!isVoiceDesign &&
            (!formData.modelId ||
                (requiresVoiceId && !formData.voiceId && !formData.name.trim())));

    return (
        <BottomMenu
            isOpen={isOpen}
            onClose={onClose}
            title={formData.id ? "Edit Voice" : "Create Voice"}
        >
            <div className="space-y-4 pb-2">
                {/* Voice Name */}
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-white/70">Voice Name</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="My Character Voice"
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
                    />
                </div>

                {/* Provider Selection */}
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-white/70">Provider</label>
                    <select
                        value={formData.providerId}
                        onChange={(e) => setFormData({ ...formData, providerId: e.target.value, modelId: "" })}
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
                    >
                        {providers.map((p) => (
                            <option key={p.id} value={p.id} className="bg-black">
                                {p.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Model Selection */}
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-white/70">Model</label>
                    <select
                        value={formData.modelId}
                        onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
                    >
                        {models.map((m) => (
                            <option key={m.id} value={m.id} className="bg-black">
                                {m.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Prompt */}
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-white/70">
                        Voice Prompt
                    </label>
                    <textarea
                        value={formData.prompt ?? ""}
                        onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                        placeholder="A warm, friendly voice with a cheerful tone..."
                        rows={3}
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none resize-none"
                    />
                    <p className="mt-1 text-[10px] text-white/40">
                        Describe how the voice should sound
                    </p>
                </div>

                {/* Example Text */}
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-white/70">
                        Example Text
                    </label>
                    <textarea
                        value={textSample}
                        onChange={(e) => {
                            setTextSample(e.target.value);
                            if (previewError) setPreviewError(null);
                        }}
                        placeholder="Hello! This is how I sound when speaking..."
                        rows={2}
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none resize-none"
                    />
                    <p className="mt-1 text-[10px] text-white/40">
                        Sample text for testing the voice
                    </p>
                    {isVoiceDesign && (
                        <p className={`mt-1 text-[10px] ${sampleLength < minVoiceDesignChars ? "text-rose-300" : "text-white/40"}`}>
                            {sampleLength}/{minVoiceDesignChars} characters required for voice design preview
                        </p>
                    )}
                    {previewError && (
                        <p className="mt-1 text-xs font-medium text-rose-300">{previewError}</p>
                    )}
                </div>

                {/* Preview Button */}
                <button
                    onClick={() => void handlePreview()}
                    disabled={previewDisabled}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:border-emerald-400/50 hover:bg-emerald-400/20 disabled:opacity-50"
                >
                    {isPlaying ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Playing...
                        </>
                    ) : (
                        <>
                            <Play className="h-4 w-4" />
                            Preview Voice
                        </>
                    )}
                </button>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                    <button
                        onClick={onClose}
                        className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => void handleSave()}
                        disabled={isSaving || !formData.name.trim()}
                        className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/60 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? "Saving..." : "Save"}
                    </button>
                </div>
            </div>
        </BottomMenu>
    );
}

interface ProviderEditorProps {
    isOpen: boolean;
    provider: AudioProvider | null;
    onClose: () => void;
    onSave: (provider: AudioProvider) => Promise<void>;
}

function ProviderEditor({ isOpen, provider, onClose, onSave }: ProviderEditorProps) {
    const [formData, setFormData] = useState<AudioProvider | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    useEffect(() => {
        if (provider) {
            setFormData({ ...provider });
            setValidationError(null);
        }
    }, [provider]);

    const handleSave = async () => {
        if (!formData || !formData.label.trim()) return;

        if (!formData.apiKey?.trim()) {
            setValidationError("API key is required");
            return;
        }

        if (formData.providerType === "gemini_tts" && !formData.projectId?.trim()) {
            setValidationError("Project ID is required for Gemini TTS");
            return;
        }

        setIsSaving(true);
        setValidationError(null);

        try {
            const isValid = await verifyAudioProvider(
                formData.providerType,
                formData.apiKey,
                formData.projectId
            );

            if (!isValid) {
                setValidationError("Invalid API key or credentials");
                return;
            }

            await onSave(formData);
        } catch (e) {
            setValidationError(e instanceof Error ? e.message : "Verification failed");
        } finally {
            setIsSaving(false);
        }
    };

    if (!formData) return null;

    return (
        <BottomMenu
            isOpen={isOpen}
            onClose={onClose}
            title={formData.id ? "Edit Provider" : "Add Audio Provider"}
        >
            <div className="space-y-4 pb-2">
                {/* Provider Type */}
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-white/70">Provider Type</label>
                    <select
                        value={formData.providerType}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                providerType: e.target.value as AudioProviderType,
                                projectId: undefined,
                                location: undefined,
                            })
                        }
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
                    >
                        <option value="elevenlabs" className="bg-black">ElevenLabs</option>
                        <option value="gemini_tts" className="bg-black">Gemini TTS (Google)</option>
                    </select>
                </div>

                {/* Label */}
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-white/70">Label</label>
                    <input
                        type="text"
                        value={formData.label}
                        onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                        placeholder={formData.providerType === "gemini_tts" ? "My Gemini TTS" : "My ElevenLabs"}
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
                    />
                </div>

                {/* API Key */}
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-white/70">API Key</label>
                    <input
                        type="password"
                        value={formData.apiKey ?? ""}
                        onChange={(e) => {
                            setFormData({ ...formData, apiKey: e.target.value });
                            if (validationError) setValidationError(null);
                        }}
                        placeholder="Enter your API key"
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
                    />
                </div>

                {/* Gemini-specific fields */}
                {formData.providerType === "gemini_tts" && (
                    <>
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-white/70">
                                Google Cloud Project ID
                            </label>
                            <input
                                type="text"
                                value={formData.projectId ?? ""}
                                onChange={(e) => {
                                    setFormData({ ...formData, projectId: e.target.value });
                                    if (validationError) setValidationError(null);
                                }}
                                placeholder="your-project-id"
                                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-white/70">
                                Region (optional)
                            </label>
                            <input
                                type="text"
                                value={formData.location ?? ""}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                placeholder="us-central1"
                                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
                            />
                        </div>
                    </>
                )}

                {validationError && (
                    <p className="text-xs font-medium text-rose-300">{validationError}</p>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                    <button
                        onClick={onClose}
                        className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => void handleSave()}
                        disabled={isSaving || !formData.label.trim()}
                        className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/60 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? "Verifying..." : "Save"}
                    </button>
                </div>
            </div>
        </BottomMenu>
    );
}
