import { useEffect } from "react";
import { Check, ChevronRight, SlidersHorizontal, Target, Scale, Sparkles, Settings2, Lightbulb, Cpu } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import {
    ADVANCED_TEMPERATURE_RANGE,
    ADVANCED_TOP_P_RANGE,
    ADVANCED_MAX_TOKENS_RANGE,
} from "../../components/AdvancedModelSettingsForm";
import { useModelsController } from "./hooks/useModelsController";

export function ModelsPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const isAdvancedView = searchParams.get("view") === "advanced";
    const {
        state: {
            providers,
            models,
            defaultModelId,
            advancedDraft,
            advancedSaving,
            advancedError,
            forceCustomMode,
        },
        setAdvancedDraft,
        updateAdvancedDraft,
        setForceCustomMode,
        handleSaveAdvancedDefaults,
        advancedDirty,
        advancedSummary,
    } = useModelsController();

    const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
        <div className="flex h-64 flex-col items-center justify-center">
            <Cpu className="mb-3 h-12 w-12 text-white/20" />
            <h3 className="mb-1 text-lg font-medium text-white">No Models yet</h3>
            <p className="mb-4 text-center text-sm text-white/50">
                Add and manage AI models from different providers
            </p>
            <button
                onClick={onCreate}
                className="rounded-full border border-emerald-400/40 bg-emerald-400/20 px-6 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/30 active:scale-[0.99]"
            >
                Add Model
            </button>
        </div>
    );

    useEffect(() => {
        (window as any).__openAddModel = () => navigate('/settings/models/new');
        const listener = () => navigate('/settings/models/new');
        window.addEventListener("models:add", listener);
        return () => {
            if ((window as any).__openAddModel) {
                delete (window as any).__openAddModel;
            }
            window.removeEventListener("models:add", listener);
        };
    }, [navigate]);

    const openAdvancedView = () => {
        const next = new URLSearchParams(searchParams);
        next.set("view", "advanced");
        setSearchParams(next, { replace: true });
    };

    if (isAdvancedView) {
        // Detect current preset
        const detectPreset = () => {
            // If user explicitly clicked Custom, stay in custom mode
            if (forceCustomMode) return 'custom';

            const temp = advancedDraft.temperature ?? 0.7;
            const topP = advancedDraft.topP ?? 1;

            if (temp === 0.3 && topP === 0.9) return 'precise';
            if (temp === 0.7 && topP === 1) return 'balanced';
            if (temp === 1.2 && topP === 1) return 'creative';
            return 'custom';
        };

        const currentPreset = detectPreset();

        const presets = [
            {
                id: 'precise',
                label: 'Precise',
                description: 'Focused & consistent responses',
                icon: Target,
                settings: { temperature: 0.3, topP: 0.9, maxOutputTokens: null }
            },
            {
                id: 'balanced',
                label: 'Balanced',
                description: 'Good mix of creativity & reliability',
                icon: Scale,
                settings: { temperature: 0.7, topP: 1, maxOutputTokens: null }
            },
            {
                id: 'creative',
                label: 'Creative',
                description: 'Varied & imaginative outputs',
                icon: Sparkles,
                settings: { temperature: 1.2, topP: 1, maxOutputTokens: null }
            },
            {
                id: 'custom',
                label: 'Custom',
                description: 'Fine-tune your own settings',
                icon: Settings2,
                settings: advancedDraft
            }
        ];

        return (
            <div className="flex h-full flex-col bg-[#050505]">
                <main className="flex-1 overflow-y-auto px-4 py-4 pb-safe space-y-4">
                    {/* Preset Cards */}
                    <div className="space-y-3">
                        {presets.map((preset) => {
                            const isSelected = currentPreset === preset.id;
                            const PresetIcon = preset.icon;
                            const isCustom = preset.id === 'custom';

                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => {
                                        if (isCustom) {
                                            setForceCustomMode(true);
                                        } else {
                                            setForceCustomMode(false);
                                            setAdvancedDraft(preset.settings);
                                        }
                                    }}
                                    className={`w-full rounded-2xl border p-4 text-left transition ${isSelected
                                            ? 'border-emerald-400/40 bg-gradient-to-br from-emerald-400/20 to-emerald-500/10'
                                            : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 active:scale-[0.99]'
                                        } ${isCustom && !isSelected ? 'cursor-pointer' : ''}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80">
                                            <PresetIcon className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-semibold text-white">{preset.label}</h3>
                                                {isSelected && (
                                                    <div className="rounded-full bg-emerald-400/30 px-2 py-0.5 text-[10px] font-medium text-emerald-100">
                                                        Active
                                                    </div>
                                                )}
                                            </div>
                                            <p className="mt-0.5 text-xs text-white/60">{preset.description}</p>
                                            {!isCustom && (
                                                <div className="mt-2 flex gap-3 text-[11px] text-white/50">
                                                    <span>Temp: {preset.settings.temperature}</span>
                                                    <span>•</span>
                                                    <span>Top-P: {preset.settings.topP}</span>
                                                </div>
                                            )}
                                            {isCustom && isSelected && (
                                                <div className="mt-2 flex gap-3 text-[11px] text-white/50">
                                                    <span>Temp: {(advancedDraft.temperature ?? 0.7).toFixed(2)}</span>
                                                    <span>•</span>
                                                    <span>Top-P: {(advancedDraft.topP ?? 1).toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Custom Controls - Only show if custom is active */}
                    <AnimatePresence>
                        {currentPreset === 'custom' && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="overflow-hidden"
                            >
                                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <div className="flex items-center gap-2">
                                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-white/80">
                                            <Settings2 className="h-4 w-4" />
                                        </div>
                                        <h3 className="text-sm font-semibold text-white">Custom Parameters</h3>
                                    </div>

                                    {/* Temperature Slider */}
                                    <div>
                                        <div className="mb-2 flex items-center justify-between">
                                            <label className="text-xs font-medium text-white/70">Temperature</label>
                                            <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs text-white/90">
                                                {(advancedDraft.temperature ?? 0.7).toFixed(2)}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={ADVANCED_TEMPERATURE_RANGE.min}
                                            max={ADVANCED_TEMPERATURE_RANGE.max}
                                            step={0.01}
                                            value={advancedDraft.temperature ?? 0.7}
                                            onChange={(e) => {
                                                const next = Number(e.target.value);
                                                updateAdvancedDraft({ temperature: Number(next.toFixed(2)) });
                                                setForceCustomMode(true);
                                            }}
                                            className="h-2 w-full appearance-none rounded-full bg-white/10 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/50
                                                [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-400/40 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-emerald-400 [&::-webkit-slider-thumb]:to-emerald-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110
                                                [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-400/40 [&::-moz-range-thumb]:bg-gradient-to-br [&::-moz-range-thumb]:from-emerald-400 [&::-moz-range-thumb]:to-emerald-500 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:hover:scale-110"
                                        />
                                        <div className="mt-1 flex justify-between text-[10px] text-white/40">
                                            <span>Focused</span>
                                            <span>Creative</span>
                                        </div>
                                    </div>

                                    {/* Top P Slider */}
                                    <div>
                                        <div className="mb-2 flex items-center justify-between">
                                            <label className="text-xs font-medium text-white/70">Top-P (Nucleus Sampling)</label>
                                            <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs text-white/90">
                                                {(advancedDraft.topP ?? 1).toFixed(2)}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={ADVANCED_TOP_P_RANGE.min}
                                            max={ADVANCED_TOP_P_RANGE.max}
                                            step={0.01}
                                            value={advancedDraft.topP ?? 1}
                                            onChange={(e) => {
                                                const next = Number(e.target.value);
                                                updateAdvancedDraft({ topP: Number(next.toFixed(2)) });
                                                setForceCustomMode(true);
                                            }}
                                            className="h-2 w-full appearance-none rounded-full bg-white/10 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/50
                                                [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-400/40 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-emerald-400 [&::-webkit-slider-thumb]:to-emerald-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110
                                                [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-400/40 [&::-moz-range-thumb]:bg-gradient-to-br [&::-moz-range-thumb]:from-emerald-400 [&::-moz-range-thumb]:to-emerald-500 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:hover:scale-110"
                                        />
                                        <div className="mt-1 flex justify-between text-[10px] text-white/40">
                                            <span>Narrow</span>
                                            <span>Diverse</span>
                                        </div>
                                    </div>

                                    {/* Max Tokens */}
                                    <div>
                                        <label className="mb-2 block text-xs font-medium text-white/70">Max Output Tokens</label>
                                        <input
                                            type="number"
                                            min={ADVANCED_MAX_TOKENS_RANGE.min}
                                            max={ADVANCED_MAX_TOKENS_RANGE.max}
                                            value={advancedDraft.maxOutputTokens ?? ''}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? null : Number(e.target.value);
                                                updateAdvancedDraft({ maxOutputTokens: val });
                                                setForceCustomMode(true);
                                            }}
                                            placeholder="Auto"
                                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-emerald-400/50 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Info Card */}
                    <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-4">
                        <div className="flex gap-3">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-400/10 text-blue-400">
                                <Lightbulb className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-semibold text-blue-200">What are these settings?</h3>
                                <p className="mt-1 text-xs leading-relaxed text-blue-200/70">
                                    These parameters control how your AI generates responses. Higher temperature = more creative but less predictable.
                                    Lower values = more focused and consistent. Most users prefer "Balanced" for everyday use.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    {advancedError && (
                        <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                            {advancedError}
                        </div>
                    )}

                    {/* Save Button - Always visible */}
                    <button
                        type="button"
                        onClick={handleSaveAdvancedDefaults}
                        disabled={!advancedDirty || advancedSaving}
                        className="w-full rounded-xl border border-emerald-400/40 bg-emerald-400/20 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/60 hover:bg-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
                    >
                        {advancedSaving ? "Saving..." : advancedDirty ? "Save Changes" : "Saved"}
                    </button>
                </main>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* List (TopNav handles title/back) */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                <button
                    onClick={openAdvancedView}
                    className="flex w-full items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-left text-white transition hover:border-emerald-400/50 hover:bg-emerald-400/20 active:scale-[0.99]"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/20 text-emerald-100">
                            <SlidersHorizontal className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-white">
                                Response Style
                            </div>
                            <div className="mt-0.5 truncate text-xs text-emerald-100/80">
                                {advancedSummary}
                            </div>
                        </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-emerald-200" />
                </button>

                {models.length === 0 && (
                    <EmptyState
                        onCreate={() => navigate('/settings/models/new')}
                    />
                )}
                {models.map(model => {
                    const isDefault = model.id === defaultModelId;
                    const providerInfo = providers.find(p => p.providerId === model.providerId);
                    return (
                        <button
                            key={model.id}
                            onClick={() => navigate(`/settings/models/${model.id}`)}
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
        </div>
    );
}
