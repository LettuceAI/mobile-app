import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sliders, Sparkles, ChevronRight } from "lucide-react";
import { readSettings, saveAdvancedSettings, checkEmbeddingModel } from "../../../core/storage/repo";
//import type { Model } from "../../../core/storage/schemas";
import { cn, typography, spacing, interactive } from "../../design-tokens";
import { EmbeddingDownloadPrompt } from "../../components/EmbeddingDownloadPrompt";

export function AdvancedPage() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    //const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
    const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);

    // Settings state
    //const [creationHelperEnabled, setCreationHelperEnabled] = useState(false);
    //const [creationHelperModelId, setCreationHelperModelId] = useState<string>("");
    const [dynamicMemoryEnabled, setDynamicMemoryEnabled] = useState(false);

    // Load settings on mount
    useEffect(() => {
        Promise.all([readSettings()])
            .then(([settings]) => {
                //setCreationHelperEnabled(settings.advancedSettings?.creationHelperEnabled ?? false);
                //setCreationHelperModelId(settings.advancedSettings?.creationHelperModelId || "");
                setDynamicMemoryEnabled(settings.advancedSettings?.dynamicMemory?.enabled ?? false);
                //setModels(settings.models.map((m: Model) => ({ id: m.id, name: m.name })));
                setIsLoading(false);
            })
            .catch((err) => {
                console.error("Failed to load settings:", err);
                setIsLoading(false);
            });
    }, []);

    /*const handleToggleCreationHelper = async () => {
        const newValue = !creationHelperEnabled;
        setCreationHelperEnabled(newValue);

        try {
            const settings = await readSettings();
            if (!settings.advancedSettings) {
                settings.advancedSettings = {
                    creationHelperEnabled: false,
                    dynamicMemory: { enabled: false, summaryMessageInterval: 20, maxEntries: 50, minSimilarityThreshold: 0.35, hotMemoryTokenBudget: 2000, decayRate: 0.08, coldThreshold: 0.3 },
                };
            }
            settings.advancedSettings.creationHelperEnabled = newValue;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save creation helper setting:", err);
            setCreationHelperEnabled(!newValue);
        }
    };*/

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
                return;
            }
        }

        setDynamicMemoryEnabled(newValue);

        try {
            const settings = await readSettings();
            if (!settings.advancedSettings) {
                settings.advancedSettings = {
                    creationHelperEnabled: false,
                    dynamicMemory: { enabled: false, summaryMessageInterval: 20, maxEntries: 50, minSimilarityThreshold: 0.35, hotMemoryTokenBudget: 2000, decayRate: 0.08, coldThreshold: 0.3 },
                };
            }
            if (!settings.advancedSettings.dynamicMemory) {
                settings.advancedSettings.dynamicMemory = { enabled: false, summaryMessageInterval: 20, maxEntries: 50, minSimilarityThreshold: 0.35, hotMemoryTokenBudget: 2000, decayRate: 0.08, coldThreshold: 0.3 };
            }

            if (newValue && !settings.advancedSettings.summarisationModelId && settings.defaultModelId) {
                settings.advancedSettings.summarisationModelId = settings.defaultModelId;
            }

            settings.advancedSettings.dynamicMemory.enabled = newValue;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save dynamic memory setting:", err);
            setDynamicMemoryEnabled(!newValue);
        }
    };

    /*const handleCreationHelperModelChange = async (modelId: string) => {
        setCreationHelperModelId(modelId);

        try {
            const settings = await readSettings();
            if (!settings.advancedSettings) {
                settings.advancedSettings = {
                    creationHelperEnabled: false,
                    dynamicMemory: { enabled: false, summaryMessageInterval: 20, maxEntries: 50, minSimilarityThreshold: 0.35, hotMemoryTokenBudget: 2000, decayRate: 0.08, coldThreshold: 0.3 },
                };
            }
            settings.advancedSettings.creationHelperModelId = modelId;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save creation helper model:", err);
        }
    };*/



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
                        {/* Creation Helper Toggle - Coming Soon */}
                        <div className={cn(
                            "relative overflow-hidden rounded-xl border px-4 py-3 opacity-60",
                            "border-white/10 bg-white/5"
                        )}>
                            <div className="relative flex items-start gap-3">
                                <div className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                                    "border-white/10 bg-white/10"
                                )}>
                                    <Sparkles className="h-4 w-4 text-white/70" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-white">Creation Helper</span>
                                                <span className={cn(
                                                    "rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none uppercase tracking-[0.25em]",
                                                    "border-white/20 bg-white/10 text-white/60"
                                                )}>
                                                    Coming Soon
                                                </span>
                                            </div>
                                            <div className="mt-0.5 text-[11px] text-white/50">
                                                AI will assist with character creation
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-[11px] text-white/45 leading-relaxed">
                                        AI will suggest names, descriptions, and traits
                                    </div>
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
