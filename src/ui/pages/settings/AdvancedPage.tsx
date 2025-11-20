import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sliders, Sparkles, ChevronRight } from "lucide-react";
import { readSettings, saveAdvancedSettings, checkEmbeddingModel } from "../../../core/storage/repo";
import type { Model } from "../../../core/storage/schemas";
import { cn, typography, spacing, interactive } from "../../design-tokens";
import { EmbeddingDownloadPrompt } from "../../components/EmbeddingDownloadPrompt";

export function AdvancedPage() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
    const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);

    // Settings state
    const [creationHelperEnabled, setCreationHelperEnabled] = useState(false);
    const [creationHelperModelId, setCreationHelperModelId] = useState<string>("");
    const [dynamicMemoryEnabled, setDynamicMemoryEnabled] = useState(false);

    // Load settings on mount
    useEffect(() => {
        Promise.all([readSettings()])
            .then(([settings]) => {
                setCreationHelperEnabled(settings.advancedSettings?.creationHelperEnabled ?? false);
                setCreationHelperModelId(settings.advancedSettings?.creationHelperModelId || "");
                setDynamicMemoryEnabled(settings.advancedSettings?.dynamicMemory?.enabled ?? false);
                setModels(settings.models.map((m: Model) => ({ id: m.id, name: m.name })));
                setIsLoading(false);
            })
            .catch((err) => {
                console.error("Failed to load settings:", err);
                setIsLoading(false);
            });
    }, []);

    const handleToggleCreationHelper = async () => {
        const newValue = !creationHelperEnabled;
        setCreationHelperEnabled(newValue);

        try {
            const settings = await readSettings();
            if (!settings.advancedSettings) {
                settings.advancedSettings = {
                    creationHelperEnabled: false,
                    dynamicMemory: { enabled: false, summaryMessageInterval: 20, maxEntries: 50 },
                };
            }
            settings.advancedSettings.creationHelperEnabled = newValue;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save creation helper setting:", err);
            setCreationHelperEnabled(!newValue);
        }
    };

    const handleToggleDynamicMemory = async () => {
        const newValue = !dynamicMemoryEnabled;

        // If enabling, check if model exists
        if (newValue) {
            try {
                const modelExists = await checkEmbeddingModel();
                if (!modelExists) {
                    setShowDownloadPrompt(true);
                    return;
                }
            } catch (err) {
                console.error("Failed to check embedding model:", err);
                // Fail safe: allow enabling but log error, or maybe block? 
                // Let's block and show prompt if check fails to be safe, or maybe just alert.
                // For now, assuming if check fails, we probably can't run it anyway.
                return;
            }
        }

        setDynamicMemoryEnabled(newValue);

        try {
            const settings = await readSettings();
            if (!settings.advancedSettings) {
                settings.advancedSettings = {
                    creationHelperEnabled: false,
                    dynamicMemory: { enabled: false, summaryMessageInterval: 20, maxEntries: 50 },
                };
            }
            if (!settings.advancedSettings.dynamicMemory) {
                settings.advancedSettings.dynamicMemory = { enabled: false, summaryMessageInterval: 20, maxEntries: 50 };
            }
            settings.advancedSettings.dynamicMemory.enabled = newValue;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save dynamic memory setting:", err);
            setDynamicMemoryEnabled(!newValue);
        }
    };

    const handleCreationHelperModelChange = async (modelId: string) => {
        setCreationHelperModelId(modelId);

        try {
            const settings = await readSettings();
            if (!settings.advancedSettings) {
                settings.advancedSettings = {
                    creationHelperEnabled: false,
                    dynamicMemory: { enabled: false, summaryMessageInterval: 20, maxEntries: 50 },
                };
            }
            settings.advancedSettings.creationHelperModelId = modelId;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save creation helper model:", err);
        }
    };



    if (isLoading) {
        return null;
    }

    return (
        <div className="flex h-full flex-col pb-16">
            <section className={cn("flex-1 overflow-y-auto px-3 pt-3", spacing.section)}>
                {/* Section: AI Features */}
                <div>
                    <h2 className={cn(
                        "mb-2 px-1",
                        typography.overline.size,
                        typography.overline.weight,
                        typography.overline.tracking,
                        typography.overline.transform,
                        "text-white/35"
                    )}>
                        AI Features
                    </h2>
                    <div className="space-y-2">
                        {/* Creation Helper Toggle */}
                        <div className={cn(
                            "relative overflow-hidden rounded-xl border px-4 py-3 transition-all duration-300",
                            creationHelperEnabled
                                ? "border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 via-white/5 to-white/5 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                                : "border-white/10 bg-white/5"
                        )}>
                            {creationHelperEnabled && (
                                <div
                                    className="pointer-events-none absolute inset-0 opacity-60"
                                    style={{
                                        background: 'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.08) 0%, transparent 50%)'
                                    }}
                                />
                            )}

                            <div className="relative flex items-start gap-3">
                                <div className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300",
                                    creationHelperEnabled
                                        ? "border-emerald-400/40 bg-emerald-500/15 shadow-lg shadow-emerald-500/25"
                                        : "border-white/10 bg-white/10"
                                )}>
                                    <Sparkles className={cn(
                                        "h-4 w-4 transition-colors duration-300",
                                        creationHelperEnabled ? "text-emerald-200" : "text-white/70"
                                    )} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-white">Creation Helper</span>
                                                <span className={cn(
                                                    "rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none uppercase tracking-[0.25em] transition-all duration-300",
                                                    creationHelperEnabled
                                                        ? "border-emerald-400/50 bg-emerald-500/25 text-emerald-100 shadow-sm shadow-emerald-500/30"
                                                        : "border-orange-400/40 bg-orange-500/20 text-orange-200"
                                                )}>
                                                    {creationHelperEnabled ? 'On' : 'Off'}
                                                </span>
                                            </div>
                                            <div className="mt-0.5 text-[11px] text-white/50">
                                                {creationHelperEnabled ? 'AI assists with character creation' : 'Manual character creation'}
                                            </div>
                                        </div>
                                        <div className="flex items-center">
                                            <input
                                                id="creation-helper"
                                                type="checkbox"
                                                checked={creationHelperEnabled}
                                                onChange={handleToggleCreationHelper}
                                                className="peer sr-only"
                                            />
                                            <label
                                                htmlFor="creation-helper"
                                                className={cn(
                                                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-400/40",
                                                    creationHelperEnabled
                                                        ? "bg-emerald-500 shadow-lg shadow-emerald-500/30"
                                                        : "bg-white/20"
                                                )}
                                            >
                                                <span className={cn(
                                                    "inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                                    creationHelperEnabled ? "translate-x-5" : "translate-x-0"
                                                )} />
                                            </label>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-[11px] text-white/45 leading-relaxed">
                                        AI suggests names, descriptions, and traits
                                    </div>
                                    <select
                                        value={creationHelperModelId}
                                        onChange={(e) => handleCreationHelperModelChange(e.target.value)}
                                        className={cn(
                                            "mt-2 w-full rounded-md",
                                            "border border-white/10 bg-white/5 px-3 py-2",
                                            "text-sm text-white",
                                            "focus:border-white/20 focus:outline-none",
                                            interactive.transition.default
                                        )}
                                    >
                                        <option value="">Select a model...</option>
                                        {models.map(model => (
                                            <option key={model.id} value={model.id}>
                                                {model.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section: Memory System */}
                <div className="mt-6">
                    <h2 className={cn(
                        "mb-2 px-1",
                        typography.overline.size,
                        typography.overline.weight,
                        typography.overline.tracking,
                        typography.overline.transform,
                        "text-white/35"
                    )}>
                        Memory System
                    </h2>
                    <div className="space-y-2">
                        {/* Dynamic Memory Row */}
                        <button
                            onClick={() => navigate('/settings/advanced/memory')}
                            className={cn(
                                "group w-full",
                                "relative overflow-hidden rounded-xl border px-4 py-3 transition-all duration-300",
                                dynamicMemoryEnabled
                                    ? "border-blue-400/20 bg-blue-400/10 hover:border-blue-400/50"
                                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/5",
                                interactive.active.scale,
                                interactive.focus.ring
                            )}
                        >
                            {dynamicMemoryEnabled && (
                                <div
                                    className="pointer-events-none absolute inset-0 opacity-60"
                                    style={{
                                        background: 'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.08) 0%, transparent 50%)'
                                    }}
                                />
                            )}

                            <div className="relative flex items-start gap-3">
                                <div className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300",
                                    dynamicMemoryEnabled
                                        ? "border-blue-400/40 bg-blue-500/15 shadow-lg shadow-blue-500/25"
                                        : "border-white/10 bg-white/10"
                                )}>
                                    <Sliders className={cn(
                                        "h-4 w-4 transition-colors duration-300",
                                        dynamicMemoryEnabled ? "text-blue-200" : "text-white/70"
                                    )} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-white">Dynamic Memory</span>
                                                <span className={cn(
                                                    "rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none uppercase tracking-[0.25em] transition-all duration-300",
                                                    dynamicMemoryEnabled
                                                        ? "border-blue-400/50 bg-blue-500/25 text-blue-100 shadow-sm shadow-blue-500/30"
                                                        : "border-orange-400/40 bg-orange-500/20 text-orange-200"
                                                )}>
                                                    {dynamicMemoryEnabled ? 'On' : 'Off'}
                                                </span>
                                            </div>
                                            <div className="mt-0.5 text-[11px] text-white/50">
                                                {dynamicMemoryEnabled ? 'AI manages conversation memory' : 'Manual memory management'}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                id="dynamic-memory"
                                                type="checkbox"
                                                checked={dynamicMemoryEnabled}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    handleToggleDynamicMemory();
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="peer sr-only"
                                            />
                                            <label
                                                htmlFor="dynamic-memory"
                                                onClick={(e) => e.stopPropagation()}
                                                className={cn(
                                                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-400/40",
                                                    dynamicMemoryEnabled
                                                        ? "bg-blue-500 shadow-lg shadow-blue-500/30"
                                                        : "bg-white/20"
                                                )}
                                            >
                                                <span className={cn(
                                                    "inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                                    dynamicMemoryEnabled ? "translate-x-5" : "translate-x-0"
                                                )} />
                                            </label>
                                            <ChevronRight className={cn(
                                                "h-4 w-4 shrink-0 text-white/30 transition-colors",
                                                "group-hover:text-white/60"
                                            )} />
                                        </div>
                                    </div>
                                    <div className="mt-2 text-[11px] text-white/45 leading-relaxed">
                                        Auto-summarize and manage conversation context
                                    </div>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
            </section>

            <EmbeddingDownloadPrompt
                isOpen={showDownloadPrompt}
                onClose={() => setShowDownloadPrompt(false)}
            />
        </div>
    );
}
