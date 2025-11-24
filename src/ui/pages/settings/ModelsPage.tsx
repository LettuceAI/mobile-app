import { useEffect, useState } from "react";
import { Check, ChevronRight, SlidersHorizontal, Target, Scale, Sparkles, Settings2, Lightbulb, Cpu, Info } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import {
    ADVANCED_TEMPERATURE_RANGE,
    ADVANCED_TOP_P_RANGE,
    ADVANCED_MAX_TOKENS_RANGE,
    ADVANCED_FREQUENCY_PENALTY_RANGE,
    ADVANCED_PRESENCE_PENALTY_RANGE,
    ADVANCED_TOP_K_RANGE,
} from "../../components/AdvancedModelSettingsForm";
import { BottomMenu } from "../../components/BottomMenu";
import { ProviderParameterSupportInfo } from "../../components/ProviderParameterSupportInfo";
import { useModelsController } from "./hooks/useModelsController";
import { useNavigationManager } from "../../navigation";

export function ModelsPage() {
    const { toNewModel, toEditModel } = useNavigationManager();
    const [searchParams, setSearchParams] = useSearchParams();
    const isAdvancedView = searchParams.get("view") === "advanced";
    const [showParameterSupport, setShowParameterSupport] = useState(false);
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
        (window as any).__openAddModel = () => toNewModel();
        const listener = () => toNewModel();
        window.addEventListener("models:add", listener);
        return () => {
            if ((window as any).__openAddModel) {
                delete (window as any).__openAddModel;
            }
            window.removeEventListener("models:add", listener);
        };
    }, [toNewModel]);

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
                                <div className="space-y-3">
                                    {/* Temperature */}
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                                <label className="text-sm font-medium text-white">Temperature</label>
                                                <p className="mt-0.5 text-xs text-white/50">Controls randomness and creativity</p>
                                            </div>
                                            <span className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-sm font-mono font-semibold text-emerald-200">
                                                {advancedDraft.temperature?.toFixed(2) ?? "0.70"}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={ADVANCED_TEMPERATURE_RANGE.min}
                                            max={ADVANCED_TEMPERATURE_RANGE.max}
                                            step={0.01}
                                            value={advancedDraft.temperature ?? 0.7}
                                            onChange={(e) => {
                                                updateAdvancedDraft({ temperature: Number(e.target.value) });
                                                setForceCustomMode(true);
                                            }}
                                            className="w-full"
                                            style={{
                                                background: `linear-gradient(to right, rgb(52, 211, 153) 0%, rgb(52, 211, 153) ${((advancedDraft.temperature ?? 0.7) / ADVANCED_TEMPERATURE_RANGE.max) * 100}%, rgba(255,255,255,0.1) ${((advancedDraft.temperature ?? 0.7) / ADVANCED_TEMPERATURE_RANGE.max) * 100}%, rgba(255,255,255,0.1) 100%)`
                                            }}
                                        />
                                        <div className="mt-2 flex items-center justify-between text-xs">
                                            <span className="text-white/40">0 - Precise</span>
                                            <span className="text-white/40">2 - Creative</span>
                                        </div>
                                    </div>

                                    {/* Top P */}
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                                <label className="text-sm font-medium text-white">Top P</label>
                                                <p className="mt-0.5 text-xs text-white/50">Nucleus sampling threshold</p>
                                            </div>
                                            <span className="rounded-lg border border-blue-400/30 bg-blue-400/10 px-2.5 py-1 text-sm font-mono font-semibold text-blue-200">
                                                {advancedDraft.topP?.toFixed(2) ?? "1.00"}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={ADVANCED_TOP_P_RANGE.min}
                                            max={ADVANCED_TOP_P_RANGE.max}
                                            step={0.01}
                                            value={advancedDraft.topP ?? 1}
                                            onChange={(e) => {
                                                updateAdvancedDraft({ topP: Number(e.target.value) });
                                                setForceCustomMode(true);
                                            }}
                                            className="w-full"
                                            style={{
                                                background: `linear-gradient(to right, rgb(96, 165, 250) 0%, rgb(96, 165, 250) ${((advancedDraft.topP ?? 1) / ADVANCED_TOP_P_RANGE.max) * 100}%, rgba(255,255,255,0.1) ${((advancedDraft.topP ?? 1) / ADVANCED_TOP_P_RANGE.max) * 100}%, rgba(255,255,255,0.1) 100%)`
                                            }}
                                        />
                                        <div className="mt-2 flex items-center justify-between text-xs">
                                            <span className="text-white/40">0 - Focused</span>
                                            <span className="text-white/40">1 - Diverse</span>
                                        </div>
                                    </div>

                                    {/* Max Tokens */}
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                        <div className="mb-3">
                                            <label className="text-sm font-medium text-white">Max Output Tokens</label>
                                            <p className="mt-0.5 text-xs text-white/50">Maximum response length</p>
                                        </div>

                                        <div className="flex gap-2 mb-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    updateAdvancedDraft({ maxOutputTokens: null });
                                                    setForceCustomMode(true);
                                                }}
                                                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${!advancedDraft.maxOutputTokens
                                                        ? 'border border-purple-400/40 bg-purple-400/20 text-purple-200'
                                                        : 'border border-white/10 bg-white/5 text-white/60 active:bg-white/10'
                                                    }`}
                                            >
                                                Auto
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    updateAdvancedDraft({ maxOutputTokens: 1024 });
                                                    setForceCustomMode(true);
                                                }}
                                                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${advancedDraft.maxOutputTokens
                                                        ? 'border border-purple-400/40 bg-purple-400/20 text-purple-200'
                                                        : 'border border-white/10 bg-white/5 text-white/60 active:bg-white/10'
                                                    }`}
                                            >
                                                Custom
                                            </button>
                                        </div>

                                        {advancedDraft.maxOutputTokens !== null && advancedDraft.maxOutputTokens !== undefined && (
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                min={ADVANCED_MAX_TOKENS_RANGE.min}
                                                max={ADVANCED_MAX_TOKENS_RANGE.max}
                                                value={advancedDraft.maxOutputTokens ?? ''}
                                                onChange={(e) => {
                                                    const val = e.target.value === '' ? null : Number(e.target.value);
                                                    updateAdvancedDraft({ maxOutputTokens: val });
                                                    setForceCustomMode(true);
                                                }}
                                                placeholder="1024"
                                                className="w-full rounded-lg border border-white/10 bg-black/20 px-3.5 py-3 text-base text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
                                            />
                                        )}

                                        <p className="mt-2 text-xs text-white/40">
                                            {!advancedDraft.maxOutputTokens
                                                ? 'Let the model decide the response length'
                                                : `Range: ${ADVANCED_MAX_TOKENS_RANGE.min.toLocaleString()} - ${ADVANCED_MAX_TOKENS_RANGE.max.toLocaleString()}`
                                            }
                                        </p>
                                    </div>

                                    {/* Frequency Penalty */}
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                                <label className="text-sm font-medium text-white">Frequency Penalty</label>
                                                <p className="mt-0.5 text-xs text-white/50">Reduce repetition of token sequences</p>
                                            </div>
                                            <span className="rounded-lg border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 text-sm font-mono font-semibold text-orange-200">
                                                {advancedDraft.frequencyPenalty?.toFixed(2) ?? "0.00"}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={ADVANCED_FREQUENCY_PENALTY_RANGE.min}
                                            max={ADVANCED_FREQUENCY_PENALTY_RANGE.max}
                                            step={0.01}
                                            value={advancedDraft.frequencyPenalty ?? 0}
                                            onChange={(e) => {
                                                updateAdvancedDraft({ frequencyPenalty: Number(e.target.value) });
                                                setForceCustomMode(true);
                                            }}
                                            className="w-full"
                                            style={{
                                                background: `linear-gradient(to right, rgb(251, 146, 60) 0%, rgb(251, 146, 60) ${((advancedDraft.frequencyPenalty ?? 0) + 2) / 4 * 100}%, rgba(255,255,255,0.1) ${((advancedDraft.frequencyPenalty ?? 0) + 2) / 4 * 100}%, rgba(255,255,255,0.1) 100%)`
                                            }}
                                        />
                                        <div className="mt-2 flex items-center justify-between text-xs">
                                            <span className="text-white/40">-2 - More Rep.</span>
                                            <span className="text-white/40">2 - Less Rep.</span>
                                        </div>
                                    </div>

                                    {/* Presence Penalty */}
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                                <label className="text-sm font-medium text-white">Presence Penalty</label>
                                                <p className="mt-0.5 text-xs text-white/50">Encourage discussing new topics</p>
                                            </div>
                                            <span className="rounded-lg border border-pink-400/30 bg-pink-400/10 px-2.5 py-1 text-sm font-mono font-semibold text-pink-200">
                                                {advancedDraft.presencePenalty?.toFixed(2) ?? "0.00"}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={ADVANCED_PRESENCE_PENALTY_RANGE.min}
                                            max={ADVANCED_PRESENCE_PENALTY_RANGE.max}
                                            step={0.01}
                                            value={advancedDraft.presencePenalty ?? 0}
                                            onChange={(e) => {
                                                updateAdvancedDraft({ presencePenalty: Number(e.target.value) });
                                                setForceCustomMode(true);
                                            }}
                                            className="w-full"
                                            style={{
                                                background: `linear-gradient(to right, rgb(244, 114, 182) 0%, rgb(244, 114, 182) ${((advancedDraft.presencePenalty ?? 0) + 2) / 4 * 100}%, rgba(255,255,255,0.1) ${((advancedDraft.presencePenalty ?? 0) + 2) / 4 * 100}%, rgba(255,255,255,0.1) 100%)`
                                            }}
                                        />
                                        <div className="mt-2 flex items-center justify-between text-xs">
                                            <span className="text-white/40">-2 - Repeat</span>
                                            <span className="text-white/40">2 - Explore</span>
                                        </div>
                                    </div>

                                    {/* Top K */}
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                        <div className="mb-3">
                                            <label className="text-sm font-medium text-white">Top K</label>
                                            <p className="mt-0.5 text-xs text-white/50">Limit sampling to top K tokens</p>
                                        </div>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            min={ADVANCED_TOP_K_RANGE.min}
                                            max={ADVANCED_TOP_K_RANGE.max}
                                            value={advancedDraft.topK ?? ''}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? null : Number(e.target.value);
                                                updateAdvancedDraft({ topK: val });
                                                setForceCustomMode(true);
                                            }}
                                            placeholder="40"
                                            className="w-full rounded-lg border border-white/10 bg-black/20 px-3.5 py-3 text-base text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
                                        />
                                        <p className="mt-2 text-xs text-white/40">
                                            Lower values = more focused, higher = more diverse
                                        </p>
                                    </div>

                                    {/* Presets */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium uppercase tracking-wider text-white/60">Quick Presets</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    updateAdvancedDraft({ temperature: 0.2, topP: 0.9, maxOutputTokens: 512, frequencyPenalty: 0, presencePenalty: 0, topK: null });
                                                    setForceCustomMode(true);
                                                }}
                                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center transition active:scale-95 active:bg-white/10"
                                            >
                                                <div className="text-xs font-semibold text-white">Precise</div>
                                                <div className="mt-0.5 text-[10px] text-white/50">Focused</div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    updateAdvancedDraft({ temperature: 0.7, topP: 1.0, maxOutputTokens: 1024, frequencyPenalty: 0, presencePenalty: 0, topK: null });
                                                    setForceCustomMode(true);
                                                }}
                                                className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2.5 text-center transition active:scale-95 active:bg-emerald-400/20"
                                            >
                                                <div className="text-xs font-semibold text-emerald-200">Balanced</div>
                                                <div className="mt-0.5 text-[10px] text-emerald-300/60">Default</div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    updateAdvancedDraft({ temperature: 0.9, topP: 1.0, maxOutputTokens: 1024, frequencyPenalty: 0, presencePenalty: 0, topK: null });
                                                    setForceCustomMode(true);
                                                }}
                                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center transition active:scale-95 active:bg-white/10"
                                            >
                                                <div className="text-xs font-semibold text-white">Creative</div>
                                                <div className="mt-0.5 text-[10px] text-white/50">Random</div>
                                            </button>
                                        </div>
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

    function providerDisplay(provider: { id: string; providerId: string; label: string; apiKey?: string | undefined; baseUrl?: string | undefined; defaultModel?: string | undefined; headers?: Record<string, string> | undefined; }) {
        // Prefer label, fallback to providerId, then id
        return provider.label || provider.providerId || provider.id;
    }
    return (
        <div className="flex h-full flex-col">
            {/* List (TopNav handles title/back) */}
            <div className="flex-1 overflow-y-auto mx-2 py-3 space-y-2">
                <div
                    className="flex w-full items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-400/10 py-3 text-white"
                >
                    <button
                        onClick={openAdvancedView}
                        className="flex flex-1 items-center gap-3 text-left transition active:scale-[0.99]"
                    >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/20 text-emerald-100">
                            <SlidersHorizontal className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-medium text-white">
                                <span>Response Style</span>
                            </div>
                            <div className="mt-0.5 truncate text-xs text-emerald-100/80">
                                {advancedSummary}
                            </div>
                        </div>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowParameterSupport(true);
                            }}
                            className="group/info flex flex-shrink-0 items-center justify-center rounded-full border border-blue-400/20 bg-blue-400/5 p-1.5 transition-all hover:border-blue-400/40 hover:bg-blue-400/10 hover:shadow-lg hover:shadow-blue-400/20 active:scale-95"
                            aria-label="View parameter support"
                        >
                            <Info className="h-3.5 w-3.5 text-blue-400 transition-transform group-hover/info:scale-110" />
                        </button>
                    </button>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-emerald-200" />
                </div>

                {models.length === 0 && (
                    <EmptyState
                        onCreate={() => toNewModel()}
                    />
                )}
                {models.map(model => {
                    const isDefault = model.id === defaultModelId;
                    const providerInfo = providers.find(p => p.providerId === model.providerId);
                    return (
                        <button
                            key={model.id}
                            onClick={() => toEditModel(model.id)}
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

            {/* Parameter Support Bottom Menu */}
            <BottomMenu
                isOpen={showParameterSupport}
                onClose={() => setShowParameterSupport(false)}
                title={`Parameter Support - ${(() => {
                    const defaultModel = models.find(m => m.id === defaultModelId);
                    const provider = providers.find(p => p.providerId === defaultModel?.providerId) ?? providers[0];
                    return provider ? providerDisplay(provider) : 'Provider';
                })()}`}
            >
                <ProviderParameterSupportInfo
                    providerId={models.find(m => m.id === defaultModelId)?.providerId || 'openai'}
                />
            </BottomMenu>
        </div>
    );
}
