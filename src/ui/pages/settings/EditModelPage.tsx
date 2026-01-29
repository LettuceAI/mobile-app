import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  ADVANCED_TEMPERATURE_RANGE,
  ADVANCED_TOP_P_RANGE,
  ADVANCED_MAX_TOKENS_RANGE,
  ADVANCED_CONTEXT_LENGTH_RANGE,
  ADVANCED_FREQUENCY_PENALTY_RANGE,
  ADVANCED_PRESENCE_PENALTY_RANGE,
  ADVANCED_TOP_K_RANGE,
  ADVANCED_REASONING_BUDGET_RANGE,
  ADVANCED_LLAMA_GPU_LAYERS_RANGE,
  ADVANCED_LLAMA_THREADS_RANGE,
  ADVANCED_LLAMA_THREADS_BATCH_RANGE,
  ADVANCED_LLAMA_SEED_RANGE,
  ADVANCED_LLAMA_ROPE_FREQ_BASE_RANGE,
  ADVANCED_LLAMA_ROPE_FREQ_SCALE_RANGE,
  ADVANCED_OLLAMA_NUM_CTX_RANGE,
  ADVANCED_OLLAMA_NUM_PREDICT_RANGE,
  ADVANCED_OLLAMA_NUM_KEEP_RANGE,
  ADVANCED_OLLAMA_NUM_BATCH_RANGE,
  ADVANCED_OLLAMA_NUM_GPU_RANGE,
  ADVANCED_OLLAMA_NUM_THREAD_RANGE,
  ADVANCED_OLLAMA_TFS_Z_RANGE,
  ADVANCED_OLLAMA_TYPICAL_P_RANGE,
  ADVANCED_OLLAMA_MIN_P_RANGE,
  ADVANCED_OLLAMA_MIROSTAT_TAU_RANGE,
  ADVANCED_OLLAMA_MIROSTAT_ETA_RANGE,
  ADVANCED_OLLAMA_REPEAT_PENALTY_RANGE,
  ADVANCED_OLLAMA_SEED_RANGE,
} from "../../components/AdvancedModelSettingsForm";
import { BottomMenu, MenuButton, MenuSection } from "../../components/BottomMenu";
import {
  Info,
  Settings,
  Brain,
  RefreshCw,
  Check,
  Search,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";
import { ProviderParameterSupportInfo } from "../../components/ProviderParameterSupportInfo";
import { useModelEditorController } from "./hooks/useModelEditorController";
import type { ReasoningSupport } from "../../../core/storage/schemas";
import { getProviderReasoningSupport } from "../../../core/storage/schemas";
import { getProviderIcon } from "../../../core/utils/providerIcons";
import { cn } from "../../design-tokens";
import { openDocs } from "../../../core/utils/docs";

type LlamaCppContextInfo = {
  maxContextLength: number;
  recommendedContextLength?: number | null;
  availableMemoryBytes?: number | null;
  modelSizeBytes?: number | null;
};

export function EditModelPage() {
  const [showParameterSupport, setShowParameterSupport] = useState(false);
  const [isManualInput, setIsManualInput] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [showPlatformSelector, setShowPlatformSelector] = useState(false);
  const [llamaContextInfo, setLlamaContextInfo] = useState<LlamaCppContextInfo | null>(null);
  const [llamaContextError, setLlamaContextError] = useState<string | null>(null);
  const [llamaContextLoading, setLlamaContextLoading] = useState(false);

  const {
    state: {
      loading,
      saving,
      verifying,
      fetchingModels,
      fetchedModels,
      error,
      providers,
      editorModel,
      modelAdvancedDraft,
    },
    canSave,
    updateEditorModel,
    handleDisplayNameChange,
    handleModelNameChange,
    handleProviderSelection,
    handleTemperatureChange,
    handleTopPChange,
    handleMaxTokensChange,
    handleContextLengthChange,
    handleFrequencyPenaltyChange,
    handlePresencePenaltyChange,
    handleTopKChange,
    handleLlamaGpuLayersChange,
    handleLlamaThreadsChange,
    handleLlamaThreadsBatchChange,
    handleLlamaSeedChange,
    handleLlamaRopeFreqBaseChange,
    handleLlamaRopeFreqScaleChange,
    handleLlamaOffloadKqvChange,
    handleOllamaNumCtxChange,
    handleOllamaNumPredictChange,
    handleOllamaNumKeepChange,
    handleOllamaNumBatchChange,
    handleOllamaNumGpuChange,
    handleOllamaNumThreadChange,
    handleOllamaTfsZChange,
    handleOllamaTypicalPChange,
    handleOllamaMinPChange,
    handleOllamaMirostatChange,
    handleOllamaMirostatTauChange,
    handleOllamaMirostatEtaChange,
    handleOllamaRepeatPenaltyChange,
    handleOllamaSeedChange,
    handleOllamaStopChange,
    handleReasoningEnabledChange,
    handleReasoningEffortChange,
    handleReasoningBudgetChange,
    handleSave,
    fetchModels,
  } = useModelEditorController();
  const isLocalModel = editorModel?.providerId === "llamacpp";
  const isOllamaModel = editorModel?.providerId === "ollama";

  // Switch to select mode automatically if models are fetched
  useEffect(() => {
    if (fetchedModels.length > 0) {
      setIsManualInput(false);
    }
  }, [fetchedModels.length]);

  // Auto-fetch models when provider changes or initial load
  useEffect(() => {
    if (editorModel?.providerId && editorModel.providerId !== "llamacpp") {
      fetchModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorModel?.providerId, editorModel?.providerLabel]);

  // Reset search when selector closes
  useEffect(() => {
    if (!showModelSelector) {
      setSearchQuery("");
    }
  }, [showModelSelector]);

  const filteredModels = fetchedModels.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.id.toLowerCase().includes(q) ||
      (m.displayName && m.displayName.toLowerCase().includes(q)) ||
      (m.description && m.description.toLowerCase().includes(q))
    );
  });
  const modelIdLabel = isLocalModel ? "Model Path (GGUF)" : "Model ID";
  const modelIdPlaceholder = isLocalModel ? "/path/to/model.gguf" : "e.g. gpt-4o";

  // Get reasoning support for the current provider
  const reasoningSupport: ReasoningSupport = editorModel?.providerId
    ? getProviderReasoningSupport(editorModel.providerId)
    : "none";
  const showReasoningSection = reasoningSupport !== "none";
  const isAutoReasoning = reasoningSupport === "auto";
  const showEffortOptions = reasoningSupport === "effort" || reasoningSupport === "dynamic";
  const numberInputClassName =
    "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none";
  const contextLimit = llamaContextInfo?.maxContextLength ?? ADVANCED_CONTEXT_LENGTH_RANGE.max;
  const recommendedContextLength = llamaContextInfo?.recommendedContextLength ?? null;
  const selectedContextLength = modelAdvancedDraft.contextLength ?? null;
  const showContextWarning =
    isLocalModel &&
    selectedContextLength &&
    recommendedContextLength !== null &&
    recommendedContextLength > 0 &&
    selectedContextLength > recommendedContextLength;
  const showContextCritical =
    isLocalModel &&
    selectedContextLength &&
    recommendedContextLength !== null &&
    recommendedContextLength === 0;
  const formatGiB = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return null;
    return (bytes / 1024 ** 3).toFixed(1);
  };
  const availableRamGiB = formatGiB(llamaContextInfo?.availableMemoryBytes ?? null);
  const modelSizeGiB = formatGiB(llamaContextInfo?.modelSizeBytes ?? null);
  const ollamaStopText = (modelAdvancedDraft.ollamaStop ?? []).join("\n");

  // Register window globals for header save button
  useEffect(() => {
    const globalWindow = window as any;
    globalWindow.__saveModel = handleSave;
    globalWindow.__saveModelCanSave = canSave;
    globalWindow.__saveModelSaving = saving || verifying;
    return () => {
      delete globalWindow.__saveModel;
      delete globalWindow.__saveModelCanSave;
      delete globalWindow.__saveModelSaving;
    };
  }, [handleSave, canSave, saving, verifying]);

  useEffect(() => {
    if (!isLocalModel) {
      setLlamaContextInfo(null);
      setLlamaContextError(null);
      setLlamaContextLoading(false);
      return;
    }

    const modelPath = editorModel?.name?.trim();
    if (!modelPath) {
      setLlamaContextInfo(null);
      setLlamaContextError(null);
      setLlamaContextLoading(false);
      return;
    }

    let cancelled = false;
    setLlamaContextLoading(true);
    setLlamaContextError(null);

    const timer = setTimeout(async () => {
      try {
        const info = await invoke<LlamaCppContextInfo>("llamacpp_context_info", { modelPath });
        if (!cancelled) {
          setLlamaContextInfo(info);
          setLlamaContextError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setLlamaContextInfo(null);
          const errorMessage =
            err?.message ??
            (typeof err === "string" ? err : err?.toString?.()) ??
            "Failed to load context limits";
          setLlamaContextError(errorMessage);
        }
      } finally {
        if (!cancelled) {
          setLlamaContextLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [editorModel?.name, isLocalModel]);

  const scopeOrder = ["text", "image", "audio"] as const;
  const toggleScope = (
    key: "inputScopes" | "outputScopes",
    scope: "image" | "audio",
    enabled: boolean,
  ) => {
    if (!editorModel) return;
    const current = new Set((editorModel as any)[key] ?? ["text"]);
    if (enabled) current.add(scope);
    else current.delete(scope);
    current.add("text");
    const next = scopeOrder.filter((s) => current.has(s));
    updateEditorModel({ [key]: next } as any);
  };

  const handleSelectModel = (modelId: string, displayName?: string) => {
    handleModelNameChange(modelId);
    if (displayName) {
      handleDisplayNameChange(displayName);
    } else {
      handleDisplayNameChange(modelId);
    }
    setShowModelSelector(false);
  };

  if (loading || !editorModel) {
    return (
      <div className="flex h-full flex-col text-gray-200">
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col text-gray-200">
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-32">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[11px] font-bold tracking-wider text-white/50 uppercase">
              Model Platform
            </label>
            {providers.length === 0 ? (
              <div className="rounded-xl border border-orange-400/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">
                No providers configured. Add a provider first.
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowPlatformSelector(true)}
                  className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white transition hover:bg-black/30 active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-white/60">
                      {getProviderIcon(editorModel.providerId)}
                    </div>
                    <span className="truncate">
                      {providers.find(
                        (p) =>
                          p.providerId === editorModel.providerId &&
                          p.label === editorModel.providerLabel,
                      )?.label ||
                        editorModel.providerLabel ||
                        editorModel.providerId ||
                        "Select Platform..."}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-white/40" />
                </button>

                <BottomMenu
                  isOpen={showPlatformSelector}
                  onClose={() => setShowPlatformSelector(false)}
                  title="Select Platform"
                >
                  <MenuSection>
                    {providers.map((prov) => {
                      const isSelected =
                        prov.providerId === editorModel.providerId &&
                        prov.label === editorModel.providerLabel;
                      return (
                        <MenuButton
                          key={prov.id}
                          icon={getProviderIcon(prov.providerId)}
                          title={prov.label || prov.providerId}
                          description={prov.providerId}
                          color={
                            isSelected
                              ? "from-emerald-500 to-emerald-600"
                              : "from-white/10 to-white/5"
                          }
                          rightElement={
                            isSelected ? (
                              <Check className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-white/20" />
                            )
                          }
                          onClick={() => {
                            handleProviderSelection(prov.providerId, prov.label || prov.providerId);
                            setShowPlatformSelector(false);
                          }}
                        />
                      );
                    })}
                  </MenuSection>
                </BottomMenu>
              </>
            )}
          </div>

          <div className="h-px bg-white/5" />

          {/* 2. MODEL NAME & ID */}
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold tracking-wider text-white/50 uppercase">
                Display Name
              </label>
              <input
                type="text"
                value={editorModel.displayName}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                placeholder="e.g. My Favorite ChatGPT"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold tracking-wider text-white/50 uppercase">
                  {modelIdLabel}
                </label>
                <div className="flex items-center gap-3">
                  {!isLocalModel && fetchedModels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsManualInput(!isManualInput)}
                      className="text-[10px] uppercase font-bold tracking-wider text-white/40 hover:text-white/80 transition"
                    >
                      {isManualInput ? "Show List" : "Manual Input"}
                    </button>
                  )}
                  {!isLocalModel && (
                    <button
                      type="button"
                      onClick={fetchModels}
                      disabled={fetchingModels || !editorModel?.providerId}
                      className="text-white/40 hover:text-white/80 transition disabled:opacity-30"
                      title="Refresh model list"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", fetchingModels && "animate-spin")} />
                    </button>
                  )}
                </div>
              </div>

              {!isLocalModel && !isManualInput && fetchedModels.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowModelSelector(true)}
                    className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white transition hover:bg-black/30 active:scale-[0.99]"
                  >
                    <span className={cn("block truncate", !editorModel.name && "text-white/40")}>
                      {fetchedModels.find((m) => m.id === editorModel.name)?.displayName ||
                        editorModel.name ||
                        "Select a model..."}
                    </span>
                    <ChevronDown className="h-4 w-4 text-white/40" />
                  </button>

                  <BottomMenu
                    isOpen={showModelSelector}
                    onClose={() => setShowModelSelector(false)}
                    title="Select Model"
                  >
                    <div className="px-4 pb-2 sticky top-0 z-10 bg-[#0f1014]">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                        <input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search models..."
                          className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white placeholder-white/40 focus:border-white/20 focus:outline-none"
                          autoFocus
                        />
                      </div>
                    </div>
                    <MenuSection>
                      {filteredModels.length > 0 ? (
                        filteredModels.map((m) => {
                          const isSelected = m.id === editorModel.name;
                          return (
                            <MenuButton
                              key={m.id}
                              icon={getProviderIcon(editorModel.providerId)}
                              title={m.displayName || m.id}
                              description={m.description || m.id}
                              color="from-emerald-500 to-emerald-600"
                              rightElement={
                                isSelected ? (
                                  <Check className="h-4 w-4 text-emerald-400" />
                                ) : undefined
                              }
                              onClick={() => handleSelectModel(m.id, m.displayName)}
                            />
                          );
                        })
                      ) : (
                        <div className="py-12 text-center text-sm text-white/40">
                          No models found matching "{searchQuery}"
                        </div>
                      )}
                    </MenuSection>
                  </BottomMenu>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={editorModel.name}
                    onChange={(e) => handleModelNameChange(e.target.value)}
                    placeholder={modelIdPlaceholder}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
                  />
                  {isLocalModel && (
                    <p className="text-[11px] text-white/40">
                      Use the full file path to a local GGUF model.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="h-px bg-white/5" />

          {/* 3. COLLAPSIBLE ADVANCED SETTINGS */}
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
              className="flex w-full items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-4 transition hover:bg-white/10"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white/5 p-2">
                  <Settings className="h-4 w-4 text-white/60" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-semibold text-white">Advanced Settings</span>
                  <span className="block text-[11px] text-white/40 uppercase tracking-wider">
                    Parameters, Prompt, & Capabilities
                  </span>
                </div>
              </div>
              <ChevronRight
                className={cn(
                  "h-5 w-5 text-white/20 transition-transform duration-300",
                  isAdvancedOpen && "rotate-90",
                )}
              />
            </button>

            {isAdvancedOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden space-y-8 pt-2 px-1"
              >
                {/* Capabilities */}
                <div className="space-y-4 rounded-2xl border border-white/5 bg-white/5 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-bold tracking-wider text-white/50 uppercase">
                        Capabilities
                      </p>
                      <p className="mt-1 text-xs text-white/40">
                        Supported input/output modalities
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openDocs("imagegen", "model-capabilities")}
                      className="text-white/40 hover:text-white/60 transition"
                      aria-label="Help with capabilities"
                    >
                      <HelpCircle size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold tracking-wider text-white/20 uppercase">
                        Input
                      </p>
                      {["image", "audio"].map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          onClick={() =>
                            toggleScope(
                              "inputScopes",
                              scope as any,
                              !editorModel.inputScopes?.includes(scope as any),
                            )
                          }
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition",
                            editorModel.inputScopes?.includes(scope as any)
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-black/20 text-white/40 border border-transparent",
                          )}
                        >
                          <span className="capitalize">{scope}</span>
                          {editorModel.inputScopes?.includes(scope as any) && <Check size={12} />}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <p className="text-[10px] font-bold tracking-wider text-white/20 uppercase">
                        Output
                      </p>
                      {["image", "audio"].map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          onClick={() =>
                            toggleScope(
                              "outputScopes",
                              scope as any,
                              !editorModel.outputScopes?.includes(scope as any),
                            )
                          }
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition",
                            editorModel.outputScopes?.includes(scope as any)
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-black/20 text-white/40 border border-transparent",
                          )}
                        >
                          <span className="capitalize">{scope}</span>
                          {editorModel.outputScopes?.includes(scope as any) && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Parameters */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold tracking-wider text-white/50 uppercase">
                      Model Parameters
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowParameterSupport(true)}
                      className="text-white/40 hover:text-white/60 transition"
                    >
                      <Info size={14} />
                    </button>
                  </div>

                  <div className="space-y-8 rounded-2xl border border-white/5 bg-white/5 p-5">
                    {/* Temperature */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="space-y-0.5">
                            <span className="block text-xs font-medium text-white/70">
                              Temperature
                            </span>
                            <span className="block text-[10px] text-white/40">
                              Higher = more creative
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openDocs("models", "temperature")}
                            className="text-white/30 hover:text-white/60 transition"
                            aria-label="Help with temperature"
                          >
                            <HelpCircle size={12} />
                          </button>
                        </div>
                        <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                          {modelAdvancedDraft.temperature?.toFixed(2) ?? "0.70"}
                        </span>
                      </div>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={ADVANCED_TEMPERATURE_RANGE.min}
                        max={ADVANCED_TEMPERATURE_RANGE.max}
                        step={0.01}
                        value={modelAdvancedDraft.temperature ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          handleTemperatureChange(raw === "" ? null : Number(raw));
                        }}
                        placeholder="0.70"
                        className={numberInputClassName}
                      />
                      <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                        <span>{ADVANCED_TEMPERATURE_RANGE.min}</span>
                        <span>{ADVANCED_TEMPERATURE_RANGE.max}</span>
                      </div>
                    </div>

                    {/* Top P */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="space-y-0.5">
                            <span className="block text-xs font-medium text-white/70">Top P</span>
                            <span className="block text-[10px] text-white/40">
                              Lower = more focused
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openDocs("models", "top-p")}
                            className="text-white/30 hover:text-white/60 transition"
                            aria-label="Help with top p"
                          >
                            <HelpCircle size={12} />
                          </button>
                        </div>
                        <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                          {modelAdvancedDraft.topP?.toFixed(2) ?? "1.00"}
                        </span>
                      </div>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={ADVANCED_TOP_P_RANGE.min}
                        max={ADVANCED_TOP_P_RANGE.max}
                        step={0.01}
                        value={modelAdvancedDraft.topP ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          handleTopPChange(raw === "" ? null : Number(raw));
                        }}
                        placeholder="1.00"
                        className={numberInputClassName}
                      />
                      <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                        <span>{ADVANCED_TOP_P_RANGE.min}</span>
                        <span>{ADVANCED_TOP_P_RANGE.max}</span>
                      </div>
                    </div>

                    {/* Max Tokens */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="space-y-0.5">
                            <span className="block text-xs font-medium text-white/70">
                              Max Output Tokens
                            </span>
                            <span className="block text-[10px] text-white/40">
                              Limit response length
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openDocs("models", "max-output-tokens")}
                            className="text-white/30 hover:text-white/60 transition"
                            aria-label="Help with max output tokens"
                          >
                            <HelpCircle size={12} />
                          </button>
                        </div>
                        <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                          {modelAdvancedDraft.maxOutputTokens
                            ? modelAdvancedDraft.maxOutputTokens.toLocaleString()
                            : "Auto"}
                        </span>
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={ADVANCED_MAX_TOKENS_RANGE.min}
                        max={ADVANCED_MAX_TOKENS_RANGE.max}
                        step={1}
                        value={modelAdvancedDraft.maxOutputTokens || ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const next = raw === "" ? null : Number(raw);
                          handleMaxTokensChange(
                            next === null || !Number.isFinite(next) || next === 0
                              ? null
                              : Math.trunc(next),
                          );
                        }}
                        placeholder="Auto"
                        className={numberInputClassName}
                      />
                      <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                        <span>Auto</span>
                        <span>{ADVANCED_MAX_TOKENS_RANGE.max.toLocaleString()}</span>
                      </div>
                    </div>

                    {isLocalModel && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Context Length
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Override llama.cpp context window
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openDocs("models", "context-length")}
                              className="text-white/30 hover:text-white/60 transition"
                              aria-label="Help with context length"
                            >
                              <HelpCircle size={12} />
                            </button>
                          </div>
                          <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                            {modelAdvancedDraft.contextLength
                              ? modelAdvancedDraft.contextLength.toLocaleString()
                              : "Auto"}
                          </span>
                        </div>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={ADVANCED_CONTEXT_LENGTH_RANGE.min}
                          max={contextLimit}
                          step={1}
                          value={modelAdvancedDraft.contextLength || ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const next = raw === "" ? null : Number(raw);
                            handleContextLengthChange(
                              next === null || !Number.isFinite(next) || next === 0
                                ? null
                                : Math.trunc(next),
                            );
                          }}
                          placeholder="Auto"
                          className={numberInputClassName}
                        />
                        <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                          <span>Auto</span>
                          <span>{contextLimit.toLocaleString()}</span>
                        </div>

                        {llamaContextLoading && (
                          <p className="text-[10px] text-white/40">
                            Calculating memory limits for this model...
                          </p>
                        )}
                        {llamaContextError && (
                          <p className="text-[10px] text-amber-200">{llamaContextError}</p>
                        )}
                        {llamaContextInfo && (
                          <div className="text-[10px] text-white/40 space-y-1">
                            <p>
                              Max supported: {llamaContextInfo.maxContextLength.toLocaleString()}{" "}
                              tokens
                              {recommendedContextLength !== null
                                ? ` • Recommended: ${recommendedContextLength.toLocaleString()}`
                                : ""}
                            </p>
                            {(availableRamGiB || modelSizeGiB) && (
                              <p>
                                {availableRamGiB ? `Available RAM: ${availableRamGiB} GB` : ""}
                                {availableRamGiB && modelSizeGiB ? " • " : ""}
                                {modelSizeGiB ? `Model size: ${modelSizeGiB} GB` : ""}
                              </p>
                            )}
                            {!selectedContextLength &&
                              recommendedContextLength &&
                              recommendedContextLength > 0 && (
                                <p>Auto will use the recommended context length.</p>
                              )}
                          </div>
                        )}

                        {showContextWarning && (
                          <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>
                              Are you sure? This may not run on your device. We recommend{" "}
                              {recommendedContextLength?.toLocaleString()} tokens.
                            </span>
                          </div>
                        )}
                        {showContextCritical && (
                          <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>
                              This model likely won't fit in memory on your device. Try a smaller
                              model or a much shorter context.
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Penalties */}
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Frequency Penalty
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Reduce word repetition
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openDocs("models", "frequency-penalty")}
                              className="text-white/30 hover:text-white/60 transition"
                              aria-label="Help with frequency penalty"
                            >
                              <HelpCircle size={12} />
                            </button>
                          </div>
                          <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                            {modelAdvancedDraft.frequencyPenalty?.toFixed(2) ?? "0.00"}
                          </span>
                        </div>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={ADVANCED_FREQUENCY_PENALTY_RANGE.min}
                          max={ADVANCED_FREQUENCY_PENALTY_RANGE.max}
                          step={0.01}
                          value={modelAdvancedDraft.frequencyPenalty ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            handleFrequencyPenaltyChange(raw === "" ? null : Number(raw));
                          }}
                          placeholder="0.00"
                          className={numberInputClassName}
                        />
                        <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                          <span>{ADVANCED_FREQUENCY_PENALTY_RANGE.min}</span>
                          <span>{ADVANCED_FREQUENCY_PENALTY_RANGE.max}</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Presence Penalty
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Encourage new topics
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openDocs("models", "presence-penalty")}
                              className="text-white/30 hover:text-white/60 transition"
                              aria-label="Help with presence penalty"
                            >
                              <HelpCircle size={12} />
                            </button>
                          </div>
                          <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                            {modelAdvancedDraft.presencePenalty?.toFixed(2) ?? "0.00"}
                          </span>
                        </div>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={ADVANCED_PRESENCE_PENALTY_RANGE.min}
                          max={ADVANCED_PRESENCE_PENALTY_RANGE.max}
                          step={0.01}
                          value={modelAdvancedDraft.presencePenalty ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            handlePresencePenaltyChange(raw === "" ? null : Number(raw));
                          }}
                          placeholder="0.00"
                          className={numberInputClassName}
                        />
                        <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                          <span>{ADVANCED_PRESENCE_PENALTY_RANGE.min}</span>
                          <span>{ADVANCED_PRESENCE_PENALTY_RANGE.max}</span>
                        </div>
                      </div>
                    </div>

                    {/* Top K */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="space-y-0.5">
                            <span className="block text-xs font-medium text-white/70">Top K</span>
                            <span className="block text-[10px] text-white/40">
                              Sample from top K tokens
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openDocs("models", "top-k-if-supported")}
                            className="text-white/30 hover:text-white/60 transition"
                            aria-label="Help with top k"
                          >
                            <HelpCircle size={12} />
                          </button>
                        </div>
                        <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                          {modelAdvancedDraft.topK ? modelAdvancedDraft.topK : "Auto"}
                        </span>
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={ADVANCED_TOP_K_RANGE.min}
                        max={ADVANCED_TOP_K_RANGE.max}
                        step={1}
                        value={modelAdvancedDraft.topK || ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const next = raw === "" ? null : Number(raw);
                          handleTopKChange(
                            next === null || !Number.isFinite(next) || next === 0
                              ? null
                              : Math.trunc(next),
                          );
                        }}
                        placeholder="Auto"
                        className={numberInputClassName}
                      />
                      <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                        <span>Auto</span>
                        <span>{ADVANCED_TOP_K_RANGE.max}</span>
                      </div>
                    </div>

                    {isLocalModel && (
                      <div className="space-y-6 border-t border-white/5 pt-6">
                        <div className="space-y-1">
                          <span className="block text-xs font-semibold text-white/70">
                            llama.cpp Settings
                          </span>
                          <span className="block text-[10px] text-white/40">
                            Performance and runtime controls for local inference
                          </span>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                GPU Layers
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Offload layers to GPU (0 = CPU only)
                              </span>
                            </div>
                            <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                              {modelAdvancedDraft.llamaGpuLayers !== null &&
                              modelAdvancedDraft.llamaGpuLayers !== undefined
                                ? modelAdvancedDraft.llamaGpuLayers
                                : "Auto"}
                            </span>
                          </div>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={ADVANCED_LLAMA_GPU_LAYERS_RANGE.min}
                            max={ADVANCED_LLAMA_GPU_LAYERS_RANGE.max}
                            step={1}
                            value={modelAdvancedDraft.llamaGpuLayers ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const next = raw === "" ? null : Number(raw);
                              handleLlamaGpuLayersChange(
                                next === null || !Number.isFinite(next) || next < 0
                                  ? null
                                  : Math.trunc(next),
                              );
                            }}
                            placeholder="Auto"
                            className={numberInputClassName}
                          />
                          <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                            <span>Auto</span>
                            <span>{ADVANCED_LLAMA_GPU_LAYERS_RANGE.max}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Threads
                              </span>
                              <span className="block text-[10px] text-white/40">
                                CPU threads for generation
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={ADVANCED_LLAMA_THREADS_RANGE.min}
                              max={ADVANCED_LLAMA_THREADS_RANGE.max}
                              step={1}
                              value={modelAdvancedDraft.llamaThreads ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = raw === "" ? null : Number(raw);
                                handleLlamaThreadsChange(
                                  next === null || !Number.isFinite(next) || next <= 0
                                    ? null
                                    : Math.trunc(next),
                                );
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                            <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                              <span>Auto</span>
                              <span>{ADVANCED_LLAMA_THREADS_RANGE.max}</span>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Batch Threads
                              </span>
                              <span className="block text-[10px] text-white/40">
                                CPU threads for batch processing
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={ADVANCED_LLAMA_THREADS_BATCH_RANGE.min}
                              max={ADVANCED_LLAMA_THREADS_BATCH_RANGE.max}
                              step={1}
                              value={modelAdvancedDraft.llamaThreadsBatch ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = raw === "" ? null : Number(raw);
                                handleLlamaThreadsBatchChange(
                                  next === null || !Number.isFinite(next) || next <= 0
                                    ? null
                                    : Math.trunc(next),
                                );
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                            <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                              <span>Auto</span>
                              <span>{ADVANCED_LLAMA_THREADS_BATCH_RANGE.max}</span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">Seed</span>
                              <span className="block text-[10px] text-white/40">
                                Leave blank for random
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={ADVANCED_LLAMA_SEED_RANGE.min}
                              max={ADVANCED_LLAMA_SEED_RANGE.max}
                              step={1}
                              value={modelAdvancedDraft.llamaSeed ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = raw === "" ? null : Number(raw);
                                handleLlamaSeedChange(
                                  next === null || !Number.isFinite(next) || next < 0
                                    ? null
                                    : Math.trunc(next),
                                );
                              }}
                              placeholder="Random"
                              className={numberInputClassName}
                            />
                            <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                              <span>Random</span>
                              <span>{ADVANCED_LLAMA_SEED_RANGE.max.toLocaleString()}</span>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Offload KQV
                              </span>
                              <span className="block text-[10px] text-white/40">
                                KV cache &amp; KQV ops on GPU
                              </span>
                            </div>
                            <select
                              value={
                                modelAdvancedDraft.llamaOffloadKqv === null ||
                                modelAdvancedDraft.llamaOffloadKqv === undefined
                                  ? "auto"
                                  : modelAdvancedDraft.llamaOffloadKqv
                                    ? "on"
                                    : "off"
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                handleLlamaOffloadKqvChange(val === "auto" ? null : val === "on");
                              }}
                              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white transition focus:border-white/30 focus:outline-none"
                            >
                              <option value="auto" className="bg-[#16171d]">
                                Auto
                              </option>
                              <option value="on" className="bg-[#16171d]">
                                On
                              </option>
                              <option value="off" className="bg-[#16171d]">
                                Off
                              </option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                RoPE Base
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Frequency base override
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={ADVANCED_LLAMA_ROPE_FREQ_BASE_RANGE.min}
                              max={ADVANCED_LLAMA_ROPE_FREQ_BASE_RANGE.max}
                              step={0.1}
                              value={modelAdvancedDraft.llamaRopeFreqBase ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                handleLlamaRopeFreqBaseChange(raw === "" ? null : Number(raw));
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                            <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                              <span>Auto</span>
                              <span>
                                {ADVANCED_LLAMA_ROPE_FREQ_BASE_RANGE.max.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                RoPE Scale
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Frequency scale override
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={ADVANCED_LLAMA_ROPE_FREQ_SCALE_RANGE.min}
                              max={ADVANCED_LLAMA_ROPE_FREQ_SCALE_RANGE.max}
                              step={0.01}
                              value={modelAdvancedDraft.llamaRopeFreqScale ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                handleLlamaRopeFreqScaleChange(raw === "" ? null : Number(raw));
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                            <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                              <span>Auto</span>
                              <span>{ADVANCED_LLAMA_ROPE_FREQ_SCALE_RANGE.max}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {isOllamaModel && (
                      <div className="space-y-6 border-t border-white/5 pt-6">
                        <div className="space-y-1">
                          <span className="block text-xs font-semibold text-white/70">
                            Ollama Settings
                          </span>
                          <span className="block text-[10px] text-white/40">
                            Advanced generation and performance options
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Num Ctx
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Context window size
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={ADVANCED_OLLAMA_NUM_CTX_RANGE.min}
                              max={ADVANCED_OLLAMA_NUM_CTX_RANGE.max}
                              step={1}
                              value={modelAdvancedDraft.ollamaNumCtx ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = raw === "" ? null : Number(raw);
                                handleOllamaNumCtxChange(
                                  next === null || !Number.isFinite(next) || next < 0
                                    ? null
                                    : Math.trunc(next),
                                );
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Num Predict
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Max tokens to generate
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={ADVANCED_OLLAMA_NUM_PREDICT_RANGE.min}
                              max={ADVANCED_OLLAMA_NUM_PREDICT_RANGE.max}
                              step={1}
                              value={modelAdvancedDraft.ollamaNumPredict ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = raw === "" ? null : Number(raw);
                                handleOllamaNumPredictChange(
                                  next === null || !Number.isFinite(next) || next < 0
                                    ? null
                                    : Math.trunc(next),
                                );
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Num Keep
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Tokens to keep from prompt
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={ADVANCED_OLLAMA_NUM_KEEP_RANGE.min}
                              max={ADVANCED_OLLAMA_NUM_KEEP_RANGE.max}
                              step={1}
                              value={modelAdvancedDraft.ollamaNumKeep ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = raw === "" ? null : Number(raw);
                                handleOllamaNumKeepChange(
                                  next === null || !Number.isFinite(next) || next < 0
                                    ? null
                                    : Math.trunc(next),
                                );
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Num Batch
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Batch size for prompt processing
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={ADVANCED_OLLAMA_NUM_BATCH_RANGE.min}
                              max={ADVANCED_OLLAMA_NUM_BATCH_RANGE.max}
                              step={1}
                              value={modelAdvancedDraft.ollamaNumBatch ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = raw === "" ? null : Number(raw);
                                handleOllamaNumBatchChange(
                                  next === null || !Number.isFinite(next) || next < 1
                                    ? null
                                    : Math.trunc(next),
                                );
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Num GPU
                              </span>
                              <span className="block text-[10px] text-white/40">
                                GPU layers offload
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={ADVANCED_OLLAMA_NUM_GPU_RANGE.min}
                              max={ADVANCED_OLLAMA_NUM_GPU_RANGE.max}
                              step={1}
                              value={modelAdvancedDraft.ollamaNumGpu ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = raw === "" ? null : Number(raw);
                                handleOllamaNumGpuChange(
                                  next === null || !Number.isFinite(next) || next < 0
                                    ? null
                                    : Math.trunc(next),
                                );
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Num Thread
                              </span>
                              <span className="block text-[10px] text-white/40">
                                CPU threads for inference
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={ADVANCED_OLLAMA_NUM_THREAD_RANGE.min}
                              max={ADVANCED_OLLAMA_NUM_THREAD_RANGE.max}
                              step={1}
                              value={modelAdvancedDraft.ollamaNumThread ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = raw === "" ? null : Number(raw);
                                handleOllamaNumThreadChange(
                                  next === null || !Number.isFinite(next) || next < 1
                                    ? null
                                    : Math.trunc(next),
                                );
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">TFS Z</span>
                              <span className="block text-[10px] text-white/40">
                                Tail-free sampling (0-1)
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={ADVANCED_OLLAMA_TFS_Z_RANGE.min}
                              max={ADVANCED_OLLAMA_TFS_Z_RANGE.max}
                              step={0.01}
                              value={modelAdvancedDraft.ollamaTfsZ ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                handleOllamaTfsZChange(raw === "" ? null : Number(raw));
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Typical P
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Typical sampling (0-1)
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={ADVANCED_OLLAMA_TYPICAL_P_RANGE.min}
                              max={ADVANCED_OLLAMA_TYPICAL_P_RANGE.max}
                              step={0.01}
                              value={modelAdvancedDraft.ollamaTypicalP ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                handleOllamaTypicalPChange(raw === "" ? null : Number(raw));
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">Min P</span>
                              <span className="block text-[10px] text-white/40">
                                Min-p sampling (0-1)
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={ADVANCED_OLLAMA_MIN_P_RANGE.min}
                              max={ADVANCED_OLLAMA_MIN_P_RANGE.max}
                              step={0.01}
                              value={modelAdvancedDraft.ollamaMinP ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                handleOllamaMinPChange(raw === "" ? null : Number(raw));
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Repeat Penalty
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Penalize repetition (0-2)
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={ADVANCED_OLLAMA_REPEAT_PENALTY_RANGE.min}
                              max={ADVANCED_OLLAMA_REPEAT_PENALTY_RANGE.max}
                              step={0.01}
                              value={modelAdvancedDraft.ollamaRepeatPenalty ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                handleOllamaRepeatPenaltyChange(raw === "" ? null : Number(raw));
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Mirostat
                              </span>
                              <span className="block text-[10px] text-white/40">
                                0 = off, 1 or 2 = enabled
                              </span>
                            </div>
                            <select
                              value={
                                modelAdvancedDraft.ollamaMirostat === null ||
                                modelAdvancedDraft.ollamaMirostat === undefined
                                  ? "auto"
                                  : modelAdvancedDraft.ollamaMirostat.toString()
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                handleOllamaMirostatChange(val === "auto" ? null : Number(val));
                              }}
                              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white transition focus:border-white/30 focus:outline-none"
                            >
                              <option value="auto" className="bg-[#16171d]">
                                Auto
                              </option>
                              <option value="0" className="bg-[#16171d]">
                                0 (Off)
                              </option>
                              <option value="1" className="bg-[#16171d]">
                                1
                              </option>
                              <option value="2" className="bg-[#16171d]">
                                2
                              </option>
                            </select>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">Seed</span>
                              <span className="block text-[10px] text-white/40">
                                Leave blank for random
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={ADVANCED_OLLAMA_SEED_RANGE.min}
                              max={ADVANCED_OLLAMA_SEED_RANGE.max}
                              step={1}
                              value={modelAdvancedDraft.ollamaSeed ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = raw === "" ? null : Number(raw);
                                handleOllamaSeedChange(
                                  next === null || !Number.isFinite(next) || next < 0
                                    ? null
                                    : Math.trunc(next),
                                );
                              }}
                              placeholder="Random"
                              className={numberInputClassName}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Mirostat Tau
                              </span>
                              <span className="block text-[10px] text-white/40">
                                Target entropy
                              </span>
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={ADVANCED_OLLAMA_MIROSTAT_TAU_RANGE.min}
                              max={ADVANCED_OLLAMA_MIROSTAT_TAU_RANGE.max}
                              step={0.1}
                              value={modelAdvancedDraft.ollamaMirostatTau ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                handleOllamaMirostatTauChange(raw === "" ? null : Number(raw));
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-0.5">
                              <span className="block text-xs font-medium text-white/70">
                                Mirostat Eta
                              </span>
                              <span className="block text-[10px] text-white/40">Learning rate</span>
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={ADVANCED_OLLAMA_MIROSTAT_ETA_RANGE.min}
                              max={ADVANCED_OLLAMA_MIROSTAT_ETA_RANGE.max}
                              step={0.01}
                              value={modelAdvancedDraft.ollamaMirostatEta ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                handleOllamaMirostatEtaChange(raw === "" ? null : Number(raw));
                              }}
                              placeholder="Auto"
                              className={numberInputClassName}
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-0.5">
                            <span className="block text-xs font-medium text-white/70">
                              Stop Sequences
                            </span>
                            <span className="block text-[10px] text-white/40">
                              One per line or comma-separated
                            </span>
                          </div>
                          <textarea
                            value={ollamaStopText}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const next = raw
                                .split(/[\n,]+/)
                                .map((s) => s.trim())
                                .filter((s) => s.length > 0);
                              handleOllamaStopChange(next.length > 0 ? next : null);
                            }}
                            placeholder="e.g. \n\n###\nUser:\n"
                            rows={4}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* Reasoning Section (Thinking) */}
                    {showReasoningSection && (
                      <div className="space-y-4 border-t border-white/5 pt-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Brain size={14} className="text-amber-400" />
                            <label className="text-xs font-medium text-white/70">
                              Reasoning (Thinking)
                            </label>
                            <button
                              type="button"
                              onClick={() => openDocs("models", "reasoning-mode")}
                              className="text-white/30 hover:text-white/60 transition"
                              aria-label="Help with reasoning mode"
                            >
                              <HelpCircle size={12} />
                            </button>
                          </div>
                          {!isAutoReasoning && (
                            <label className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200">
                              <input
                                type="checkbox"
                                checked={modelAdvancedDraft.reasoningEnabled || false}
                                onChange={(e) => handleReasoningEnabledChange(e.target.checked)}
                                className="sr-only"
                              />
                              <span
                                className={cn(
                                  "inline-block h-full w-full rounded-full transition-colors duration-200",
                                  modelAdvancedDraft.reasoningEnabled
                                    ? "bg-amber-500"
                                    : "bg-white/10",
                                )}
                              />
                              <span
                                className={cn(
                                  "absolute h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200",
                                  modelAdvancedDraft.reasoningEnabled
                                    ? "translate-x-4.5"
                                    : "translate-x-1",
                                )}
                              />
                            </label>
                          )}
                        </div>

                        {(modelAdvancedDraft.reasoningEnabled || isAutoReasoning) && (
                          <div className="space-y-6 pl-2 border-l border-white/10">
                            {showEffortOptions && (
                              <div className="space-y-3">
                                <span className="text-[10px] font-bold text-white/30 uppercase">
                                  Reasoning Effort
                                </span>
                                <div className="grid grid-cols-4 gap-2">
                                  {([null, "low", "medium", "high"] as const).map((level) => (
                                    <button
                                      key={level || "auto"}
                                      type="button"
                                      onClick={() => handleReasoningEffortChange(level)}
                                      className={cn(
                                        "rounded-lg py-1.5 text-[10px] font-bold uppercase transition",
                                        modelAdvancedDraft.reasoningEffort === level
                                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                          : "bg-white/5 text-white/30 border border-transparent hover:text-white/50",
                                      )}
                                    >
                                      {level || "auto"}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {(reasoningSupport === "budget-only" ||
                              reasoningSupport === "dynamic") && (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-white/30 uppercase">
                                    Budget Tokens
                                  </span>
                                  <span className="font-mono text-xs text-amber-400">
                                    {modelAdvancedDraft.reasoningBudgetTokens
                                      ? modelAdvancedDraft.reasoningBudgetTokens.toLocaleString()
                                      : "Auto"}
                                  </span>
                                </div>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={ADVANCED_REASONING_BUDGET_RANGE.min}
                                  max={ADVANCED_REASONING_BUDGET_RANGE.max}
                                  step={1024}
                                  value={modelAdvancedDraft.reasoningBudgetTokens || ""}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const next = raw === "" ? null : Number(raw);
                                    handleReasoningBudgetChange(
                                      next === null || !Number.isFinite(next) || next === 0
                                        ? null
                                        : Math.trunc(next),
                                    );
                                  }}
                                  placeholder="Auto"
                                  className={numberInputClassName}
                                />
                                <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                                  <span>
                                    {ADVANCED_REASONING_BUDGET_RANGE.min.toLocaleString()}
                                  </span>
                                  <span>
                                    {ADVANCED_REASONING_BUDGET_RANGE.max.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <div className="h-px bg-white/5" />
        </motion.div>
      </main>

      {/* PARAMETER SUPPORT MODAL */}
      <BottomMenu
        isOpen={showParameterSupport}
        onClose={() => setShowParameterSupport(false)}
        title="Parameter Support"
      >
        <div className="px-4 pb-8">
          <ProviderParameterSupportInfo providerId={editorModel?.providerId || "openai"} />
        </div>
      </BottomMenu>
    </div>
  );
}
