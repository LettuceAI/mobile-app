import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Info, Cpu, RefreshCw, Trash2 } from "lucide-react";
import { readSettings, saveAdvancedSettings } from "../../../core/storage/repo";
import { storageBridge } from "../../../core/storage/files";
import type { Model } from "../../../core/storage/schemas";
import { cn, typography } from "../../design-tokens";
import { useNavigate } from "react-router-dom";

export function DynamicMemoryPage() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [enabled, setEnabled] = useState(false);
    const [summarisationModelId, setSummarisationModelId] = useState<string>("");
    const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
    const [summaryMessageInterval, setSummaryMessageInterval] = useState(20);
    const [maxMemoryEntries, setMaxMemoryEntries] = useState(50);
    const [minSimilarityThreshold, setMinSimilarityThreshold] = useState(0.35);
    const [hotMemoryTokenBudget, setHotMemoryTokenBudget] = useState(2000);
    const [decayRate, setDecayRate] = useState(0.08);
    const [coldThreshold, setColdThreshold] = useState(0.3);

    useEffect(() => {
        readSettings()
            .then((settings) => {
                setEnabled(settings.advancedSettings?.dynamicMemory?.enabled ?? false);
                setSummarisationModelId(settings.advancedSettings?.summarisationModelId || "");
                setSummaryMessageInterval(settings.advancedSettings?.dynamicMemory?.summaryMessageInterval ?? 20);
                setMaxMemoryEntries(settings.advancedSettings?.dynamicMemory?.maxEntries ?? 50);
                setMaxMemoryEntries(settings.advancedSettings?.dynamicMemory?.maxEntries ?? 50);
                setMinSimilarityThreshold(settings.advancedSettings?.dynamicMemory?.minSimilarityThreshold ?? 0.35);
                setHotMemoryTokenBudget(settings.advancedSettings?.dynamicMemory?.hotMemoryTokenBudget ?? 2000);
                setDecayRate(settings.advancedSettings?.dynamicMemory?.decayRate ?? 0.08);
                setColdThreshold(settings.advancedSettings?.dynamicMemory?.coldThreshold ?? 0.3);
                setModels(settings.models.map((m: Model) => ({ id: m.id, name: m.name })));
                setIsLoading(false);
            })
            .catch((err) => {
                console.error("Failed to load settings:", err);
                setIsLoading(false);
            });
    }, []);

    const handleSummarisationModelChange = async (modelId: string) => {
        setSummarisationModelId(modelId);

        try {
            const settings = await readSettings();
            if (!settings.advancedSettings) {
                settings.advancedSettings = {
                    creationHelperEnabled: false,
                    dynamicMemory: { enabled: false, summaryMessageInterval: 20, maxEntries: 50, minSimilarityThreshold: 0.35, hotMemoryTokenBudget: 2000, decayRate: 0.08, coldThreshold: 0.3 },
                };
            }
            settings.advancedSettings.summarisationModelId = modelId;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save summarisation model:", err);
        }
    };

    const handleSummaryIntervalChange = async (value: number) => {
        setSummaryMessageInterval(value);

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
            settings.advancedSettings.dynamicMemory.summaryMessageInterval = value;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save summary interval:", err);
        }
    };

    const handleMaxEntriesChange = async (value: number) => {
        setMaxMemoryEntries(value);

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
            settings.advancedSettings.dynamicMemory.maxEntries = value;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save max entries:", err);
        }
    };

    const handleMinSimilarityChange = async (value: number) => {
        setMinSimilarityThreshold(value);

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
            settings.advancedSettings.dynamicMemory.minSimilarityThreshold = value;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save min similarity threshold:", err);
        }
    };

    const handleHotMemoryTokenBudgetChange = async (value: number) => {
        setHotMemoryTokenBudget(value);
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
            settings.advancedSettings.dynamicMemory.hotMemoryTokenBudget = value;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save hot memory token budget:", err);
        }
    };

    const handleDecayRateChange = async (value: number) => {
        setDecayRate(value);
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
            settings.advancedSettings.dynamicMemory.decayRate = value;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save decay rate:", err);
        }
    };

    const handleColdThresholdChange = async (value: number) => {
        setColdThreshold(value);
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
            settings.advancedSettings.dynamicMemory.coldThreshold = value;
            await saveAdvancedSettings(settings.advancedSettings);
        } catch (err) {
            console.error("Failed to save cold threshold:", err);
        }
    };

    if (isLoading) {
        return null;
    }

    return (
        <div className="flex min-h-screen flex-col">
            <main className="flex-1 px-4 pb-24 pt-6">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-auto w-full max-w-2xl space-y-4"
                >
                    {/* Info Card */}
                    <div className={cn(
                        "rounded-xl border border-blue-400/20 bg-blue-400/5 p-3"
                    )}>
                        <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-200/80 leading-relaxed">
                                Dynamic Memory automatically summarizes conversations to maintain context efficiently.
                                Each character can choose between manual or dynamic memory management.
                            </p>
                        </div>
                    </div>

                    {/* Status Banner */}
                    {!enabled && (
                        <div className={cn(
                            "rounded-xl border border-orange-400/20 bg-orange-400/5 p-3"
                        )}>
                            <div className="flex items-start gap-2">
                                <Info className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs font-medium text-orange-200">Dynamic Memory is currently disabled</p>
                                    <p className="text-xs text-orange-200/60 mt-0.5">Enable it from the Advanced settings page to configure these options.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Configuration Options */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                    >
                        {/* Summarisation Model */}
                        <div className={cn(
                            "rounded-xl border border-white/10 bg-white/5 px-4 py-3",
                            !enabled && "opacity-50 pointer-events-none"
                        )}>
                            <div className="flex items-start gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10">
                                    <Cpu className="h-4 w-4 text-white/70" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-white">Summarisation Model</span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white/45 leading-relaxed">
                                        Model used for conversation summarization
                                    </div>
                                    <select
                                        value={summarisationModelId}
                                        onChange={(e) => handleSummarisationModelChange(e.target.value)}
                                        disabled={!enabled}
                                        className={cn(
                                            "mt-2 w-full rounded-md",
                                            "border border-white/10 bg-white/5 px-3 py-2",
                                            "text-sm text-white",
                                            "focus:border-white/20 focus:outline-none",
                                            "transition-colors"
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

                        {/* Summary Interval */}
                        <div className={cn(
                            "rounded-xl border border-white/10 bg-white/5 px-4 py-3",
                            !enabled && "opacity-50 pointer-events-none"
                        )}>
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-white">Summary Interval</span>
                                        <span className={cn(
                                            "rounded-md border border-white/10 bg-white/10 px-2 py-1",
                                            typography.caption.size,
                                            "text-white/70"
                                        )}>
                                            {summaryMessageInterval} messages
                                        </span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white/45 leading-relaxed">
                                        Summarize conversation every N messages
                                    </div>
                                    <div className="mt-3 flex items-center gap-3">
                                        <input
                                            type="range"
                                            min="10"
                                            max="100"
                                            step="5"
                                            value={summaryMessageInterval}
                                            onChange={(e) => handleSummaryIntervalChange(Number(e.target.value))}
                                            disabled={!enabled}
                                            className="flex-1 accent-blue-500"
                                        />
                                    </div>
                                    <div className="mt-1 flex justify-between text-[10px] text-white/30">
                                        <span>10</span>
                                        <span>100</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Max Memory Entries */}
                        <div className={cn(
                            "rounded-xl border border-white/10 bg-white/5 px-4 py-3",
                            !enabled && "opacity-50 pointer-events-none"
                        )}>
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-white">Maximum Memory Entries</span>
                                        <span className={cn(
                                            "rounded-md border border-white/10 bg-white/10 px-2 py-1",
                                            typography.caption.size,
                                            "text-white/70"
                                        )}>
                                            {maxMemoryEntries} entries
                                        </span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white/45 leading-relaxed">
                                        Maximum number of memory entries per session
                                    </div>
                                    <div className="mt-3 flex items-center gap-3">
                                        <input
                                            type="range"
                                            min="10"
                                            max="200"
                                            step="10"
                                            value={maxMemoryEntries}
                                            onChange={(e) => handleMaxEntriesChange(Number(e.target.value))}
                                            disabled={!enabled}
                                            className="flex-1 accent-blue-500"
                                        />
                                    </div>
                                    <div className="mt-1 flex justify-between text-[10px] text-white/30">
                                        <span>10</span>
                                        <span>200</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Min Similarity Threshold */}
                        <div className={cn(
                            "rounded-xl border border-white/10 bg-white/5 px-4 py-3",
                            !enabled && "opacity-50 pointer-events-none"
                        )}>
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-white">Memory Relevance Threshold</span>
                                        <span className={cn(
                                            "rounded-md border border-white/10 bg-white/10 px-2 py-1",
                                            typography.caption.size,
                                            "text-white/70"
                                        )}>
                                            {minSimilarityThreshold.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white/45 leading-relaxed">
                                        Minimum similarity score for memory retrieval (higher = more relevant)
                                    </div>
                                    <div className="mt-3 flex items-center gap-3">
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="0.8"
                                            step="0.05"
                                            value={minSimilarityThreshold}
                                            onChange={(e) => handleMinSimilarityChange(Number(e.target.value))}
                                            disabled={!enabled}
                                            className="flex-1 accent-blue-500"
                                        />
                                    </div>
                                    <div className="mt-1 flex justify-between text-[10px] text-white/30">
                                        <span>0.1 (loose)</span>
                                        <span>0.8 (strict)</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Hot Memory Token Budget */}
                        <div className={cn(
                            "rounded-xl border border-white/10 bg-white/5 px-4 py-3",
                            !enabled && "opacity-50 pointer-events-none"
                        )}>
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-white">Hot Memory Budget</span>
                                        <span className={cn(
                                            "rounded-md border border-white/10 bg-white/10 px-2 py-1",
                                            typography.caption.size,
                                            "text-white/70"
                                        )}>
                                            {hotMemoryTokenBudget} tokens
                                        </span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white/45 leading-relaxed">
                                        Total token limit for active memories (exceeding moves old to cold)
                                    </div>
                                    <div className="mt-3 flex items-center gap-3">
                                        <input
                                            type="range"
                                            min="500"
                                            max="10000"
                                            step="100"
                                            value={hotMemoryTokenBudget}
                                            onChange={(e) => handleHotMemoryTokenBudgetChange(Number(e.target.value))}
                                            disabled={!enabled}
                                            className="flex-1 accent-blue-500"
                                        />
                                    </div>
                                    <div className="mt-1 flex justify-between text-[10px] text-white/30">
                                        <span>500</span>
                                        <span>10000</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Decay Rate */}
                        <div className={cn(
                            "rounded-xl border border-white/10 bg-white/5 px-4 py-3",
                            !enabled && "opacity-50 pointer-events-none"
                        )}>
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-white">Memory Decay Rate</span>
                                        <span className={cn(
                                            "rounded-md border border-white/10 bg-white/10 px-2 py-1",
                                            typography.caption.size,
                                            "text-white/70"
                                        )}>
                                            {decayRate} / cycle
                                        </span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white/45 leading-relaxed">
                                        How fast memory importance drops per cycle (higher = faster forgetting)
                                    </div>
                                    <div className="mt-3 flex items-center gap-3">
                                        <input
                                            type="range"
                                            min="0.01"
                                            max="0.30"
                                            step="0.01"
                                            value={decayRate}
                                            onChange={(e) => handleDecayRateChange(Number(e.target.value))}
                                            disabled={!enabled}
                                            className="flex-1 accent-blue-500"
                                        />
                                    </div>
                                    <div className="mt-1 flex justify-between text-[10px] text-white/30">
                                        <span>0.01 (slow)</span>
                                        <span>0.30 (fast)</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Cold Threshold */}
                        <div className={cn(
                            "rounded-xl border border-white/10 bg-white/5 px-4 py-3",
                            !enabled && "opacity-50 pointer-events-none"
                        )}>
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-white">Cold Storage Threshold</span>
                                        <span className={cn(
                                            "rounded-md border border-white/10 bg-white/10 px-2 py-1",
                                            typography.caption.size,
                                            "text-white/70"
                                        )}>
                                            {coldThreshold}
                                        </span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white/45 leading-relaxed">
                                        Importance score below which memory moves to cold storage
                                    </div>
                                    <div className="mt-3 flex items-center gap-3">
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="0.5"
                                            step="0.05"
                                            value={coldThreshold}
                                            onChange={(e) => handleColdThresholdChange(Number(e.target.value))}
                                            disabled={!enabled}
                                            className="flex-1 accent-blue-500"
                                        />
                                    </div>
                                    <div className="mt-1 flex justify-between text-[10px] text-white/30">
                                        <span>0.1 (strict)</span>
                                        <span>0.5 (loose)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Model Management */}
                    {enabled && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="space-y-3 pt-4 border-t border-white/5"
                        >
                            <h3 className="text-sm font-medium text-white px-1">Model Management</h3>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => navigate("/settings/embedding-test")}
                                    className={cn(
                                        "flex items-center justify-center gap-2 rounded-xl",
                                        "border border-white/10 bg-white/5 px-4 py-3",
                                        "text-sm font-medium text-white",
                                        "hover:bg-white/10 transition-colors"
                                    )}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    Test Model
                                </button>

                                <button
                                    onClick={async () => {
                                        if (window.confirm("Are you sure you want to reinstall the model? This will delete existing model files and require a re-download.")) {
                                            try {
                                                await storageBridge.deleteEmbeddingModel();
                                                navigate("/settings/embedding-download");
                                            } catch (err) {
                                                console.error("Failed to delete model:", err);
                                            }
                                        }
                                    }}
                                    className={cn(
                                        "flex items-center justify-center gap-2 rounded-xl",
                                        "border border-red-500/20 bg-red-500/10 px-4 py-3",
                                        "text-sm font-medium text-red-200",
                                        "hover:bg-red-500/20 transition-colors"
                                    )}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Reinstall Model
                                </button>
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            </main>
        </div>
    );
}
