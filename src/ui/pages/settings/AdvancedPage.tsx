import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sliders, Sparkles, ChevronRight, ChevronDown, Cpu, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { readSettings, saveAdvancedSettings, checkEmbeddingModel } from "../../../core/storage/repo";
import type { Model } from "../../../core/storage/schemas";
import { cn, typography, spacing, interactive } from "../../design-tokens";
import { EmbeddingDownloadPrompt } from "../../components/EmbeddingDownloadPrompt";
import { BottomMenu } from "../../components/BottomMenu";
import { getProviderIcon } from "../../../core/utils/providerIcons";

export function AdvancedPage() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [models, setModels] = useState<Model[]>([]);
    const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);
    const [showModelMenu, setShowModelMenu] = useState(false);
    const [modelSearchQuery, setModelSearchQuery] = useState("");

    // Settings state
    const [creationHelperEnabled, setCreationHelperEnabled] = useState(false);
    const [creationHelperModelId, setCreationHelperModelId] = useState<string>("");
    const [dynamicMemoryEnabled, setDynamicMemoryEnabled] = useState(false);
    const [manualWindow, setManualWindow] = useState<number | null>(50);

    // Load settings on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                const [settings] = await Promise.all([
                    readSettings(),
                ]);

                setCreationHelperEnabled(settings.advancedSettings?.creationHelperEnabled ?? false);
                setCreationHelperModelId(settings.advancedSettings?.creationHelperModelId || "");
                setDynamicMemoryEnabled(settings.advancedSettings?.dynamicMemory?.enabled ?? false);
                setManualWindow(settings.advancedSettings?.manualModeContextWindow ?? 50);
                setModels(settings.models || []);
                setIsLoading(false);
            } catch (err) {
                console.error("Failed to load settings:", err);
                setIsLoading(false);
            }
        };

        loadData();
    }, []);

    const handleToggleCreationHelper = async () => {
        const newValue = !creationHelperEnabled;
        setCreationHelperEnabled(newValue);

        try {
            const settings = await readSettings();
            if (!settings.advancedSettings) {
                settings.advancedSettings = {
                    creationHelperEnabled: false,
                };
            }
            settings.advancedSettings.creationHelperEnabled = newValue;

            // Set default model if none selected
            if (newValue && !settings.advancedSettings.creationHelperModelId && settings.defaultModelId) {
                settings.advancedSettings.creationHelperModelId = settings.defaultModelId;
                setCreationHelperModelId(settings.defaultModelId);
            }

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
                return;
            }
        }

        setDynamicMemoryEnabled(newValue);

        try {
            const settings = await readSettings();
            if (!settings.advancedSettings) {
                settings.advancedSettings = {
                    creationHelperEnabled: false,
                    dynamicMemory: { enabled: false, summaryMessageInterval: 20, maxEntries: 50, minSimilarityThreshold: 0.35, hotMemoryTokenBudget: 2000, decayRate: 0.08, coldThreshold: 0.3, contextEnrichmentEnabled: true },
                };
            }
            if (!settings.advancedSettings.dynamicMemory) {
                settings.advancedSettings.dynamicMemory = { enabled: false, summaryMessageInterval: 20, maxEntries: 50, minSimilarityThreshold: 0.35, hotMemoryTokenBudget: 2000, decayRate: 0.08, coldThreshold: 0.3, contextEnrichmentEnabled: true };
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

    const handleManualWindowChange = async (value: number | null) => {
        setManualWindow(value);

        try {
            const settings = await readSettings();
            if (!settings.advancedSettings) {
                settings.advancedSettings = {
                    creationHelperEnabled: false,
                };
            }
            settings.advancedSettings.manualModeContextWindow = value === null ? 50 : value;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save manual window setting:", err);
        }
    };

    const handleCreationHelperModelChange = async (modelId: string) => {
        setCreationHelperModelId(modelId);

        try {
            const settings = await readSettings();
            if (!settings.advancedSettings) {
                settings.advancedSettings = {
                    creationHelperEnabled: false,
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
                        {/* Creation Helper Toggle - Coming Soon */}
                        <div className={cn(
                            "relative overflow-hidden rounded-xl border px-4 py-3 transition-all duration-300",
                            creationHelperEnabled
                                ? "border-rose-400/20 bg-rose-400/10"
                                : "border-white/10 bg-white/5"
                        )}>
                            <div className="relative flex items-start gap-3">
                                <div className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300",
                                    creationHelperEnabled
                                        ? "border-rose-400/40 bg-rose-500/15 shadow-lg shadow-rose-500/25"
                                        : "border-white/10 bg-white/10"
                                )}>
                                    <Sparkles className={cn(
                                        "h-4 w-4 transition-colors duration-300",
                                        creationHelperEnabled ? "text-rose-200" : "text-white/70"
                                    )} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1 text-left">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-white">Creation Helper</span>
                                                <span className={cn(
                                                    "rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none uppercase tracking-[0.25em] transition-all duration-300",
                                                    creationHelperEnabled
                                                        ? "border-rose-400/50 bg-rose-500/25 text-rose-100 shadow-sm shadow-rose-500/30"
                                                        : "border-white/20 bg-white/10 text-white/60"
                                                )}>
                                                    {creationHelperEnabled ? 'On' : 'Off'}
                                                </span>
                                            </div>
                                            <div className="mt-0.5 text-[11px] text-white/50">
                                                AI-guided character creation
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <label className="relative inline-flex cursor-pointer items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={creationHelperEnabled}
                                                    onChange={handleToggleCreationHelper}
                                                    className="peer sr-only"
                                                />
                                                <div className={cn(
                                                    "h-6 w-11 rounded-full border-2 border-transparent transition-all duration-200 ease-in-out",
                                                    creationHelperEnabled
                                                        ? "bg-rose-500 shadow-lg shadow-rose-500/30"
                                                        : "bg-white/20"
                                                )}>
                                                    <div className={cn(
                                                        "h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                                        creationHelperEnabled ? "translate-x-5" : "translate-x-0"
                                                    )} />
                                                </div>
                                            </label>
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {creationHelperEnabled && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="mt-4 space-y-3 pt-3 border-t border-white/10">
                                                    <div>
                                                        <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Helper Model</label>
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowModelMenu(true)}
                                                            className="mt-1.5 flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-left transition hover:bg-black/30 focus:border-rose-400/40 focus:outline-none"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {creationHelperModelId ? getProviderIcon(models.find(m => m.id === creationHelperModelId)?.providerId || '') : <Cpu className="h-5 w-5 text-white/40" />}
                                                                <span className={`text-sm ${creationHelperModelId ? 'text-white' : 'text-white/50'}`}>
                                                                    {creationHelperModelId
                                                                        ? models.find(m => m.id === creationHelperModelId)?.displayName || models.find(m => m.id === creationHelperModelId)?.name || 'Selected Model'
                                                                        : 'Select a model'}
                                                                </span>
                                                            </div>
                                                            <ChevronDown className="h-4 w-4 text-white/40" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
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
                                        <div className="flex-1 text-left">
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
                                            <div className="text-[11px] text-white/50">
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
                                    <div className="text-[11px] text-white/45 leading-relaxed text-left">
                                        Auto-summarize and manage conversation context
                                    </div>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Section: Manual Memory Settings */}
                <div className="mt-6">
                    <h2 className={cn(
                        "mb-2 px-1",
                        typography.overline.size,
                        typography.overline.weight,
                        typography.overline.tracking,
                        typography.overline.transform,
                        "text-white/35"
                    )}>
                        Manual Memory Settings
                    </h2>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <label className="text-xs font-medium uppercase tracking-wider text-white/70">Context Window</label>
                                <p className="mt-0.5 text-[11px] text-white/50">Number of recent messages to include (Default: 50)</p>
                            </div>
                            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/90">
                                {manualWindow ?? 50}
                            </span>
                        </div>
                        <input
                            type="number"
                            min={1}
                            max={1000}
                            value={manualWindow ?? ''}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                handleManualWindowChange(isNaN(val) ? null : val);
                            }}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none disabled:opacity-50"
                        />
                    </div>
                </div>
            </section>

            <EmbeddingDownloadPrompt
                isOpen={showDownloadPrompt}
                onClose={() => setShowDownloadPrompt(false)}
            />

            {/* Model Selection BottomMenu */}
            <BottomMenu
                isOpen={showModelMenu}
                onClose={() => {
                    setShowModelMenu(false);
                    setModelSearchQuery("");
                }}
                title="Select Model"
            >
                <div className="space-y-4">
                    <div className="relative">
                        <input
                            type="text"
                            value={modelSearchQuery}
                            onChange={(e) => setModelSearchQuery(e.target.value)}
                            placeholder="Search models..."
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 pl-10 text-sm text-white placeholder-white/40 focus:border-white/20 focus:outline-none"
                        />
                        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                        {models
                            .filter(m => {
                                if (!modelSearchQuery) return true;
                                const q = modelSearchQuery.toLowerCase();
                                return m.displayName?.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q);
                            })
                            .map((model) => (
                                <button
                                    key={model.id}
                                    onClick={() => {
                                        handleCreationHelperModelChange(model.id);
                                        setShowModelMenu(false);
                                        setModelSearchQuery("");
                                    }}
                                    className={cn(
                                        "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition",
                                        creationHelperModelId === model.id
                                            ? "border-rose-400/40 bg-rose-400/10"
                                            : "border-white/10 bg-white/5 hover:bg-white/10"
                                    )}
                                >
                                    {getProviderIcon(model.providerId)}
                                    <div className="flex-1 min-w-0">
                                        <span className="block truncate text-sm text-white">{model.displayName || model.name}</span>
                                        <span className="block truncate text-xs text-white/40">{model.name}</span>
                                    </div>
                                    {creationHelperModelId === model.id && <Check className="h-4 w-4 shrink-0 text-rose-400" />}
                                </button>
                            ))}
                    </div>
                </div>
            </BottomMenu>
        </div>
    );
}
