import { motion } from "framer-motion";
import { useState, useEffect } from "react";

import {
  ADVANCED_TEMPERATURE_RANGE,
  ADVANCED_TOP_P_RANGE,
  ADVANCED_MAX_TOKENS_RANGE,
  ADVANCED_FREQUENCY_PENALTY_RANGE,
  ADVANCED_PRESENCE_PENALTY_RANGE,
  ADVANCED_TOP_K_RANGE,
  ADVANCED_REASONING_BUDGET_RANGE,
} from "../../components/AdvancedModelSettingsForm";
import { BottomMenu, MenuButton, MenuSection } from "../../components/BottomMenu";
import { Loader2, FileText, Info, Settings, Brain, RefreshCw, ChevronDown, Check, Search, ChevronRight, HelpCircle } from "lucide-react";
import { ProviderParameterSupportInfo } from "../../components/ProviderParameterSupportInfo";
import { useModelEditorController } from "./hooks/useModelEditorController";
import type { SystemPromptTemplate, ReasoningSupport } from "../../../core/storage/schemas";
import { getProviderReasoningSupport } from "../../../core/storage/schemas";
import { listPromptTemplates } from "../../../core/prompts/service";
import { getProviderIcon } from "../../../core/utils/providerIcons";
import { cn } from "../../design-tokens";
import { openDocs } from "../../../core/utils/docs";

export function EditModelPage() {
  const [promptTemplates, setPromptTemplates] = useState<SystemPromptTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showParameterSupport, setShowParameterSupport] = useState(false);
  const [isManualInput, setIsManualInput] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [showPlatformSelector, setShowPlatformSelector] = useState(false);

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
    handleFrequencyPenaltyChange,
    handlePresencePenaltyChange,
    handleTopKChange,
    handleReasoningEnabledChange,
    handleReasoningEffortChange,
    handleReasoningBudgetChange,
    handleSave,
    fetchModels,
  } = useModelEditorController();

  // Switch to select mode automatically if models are fetched
  useEffect(() => {
    if (fetchedModels.length > 0) {
      setIsManualInput(false);
    }
  }, [fetchedModels.length]);

  // Auto-fetch models when provider changes or initial load
  useEffect(() => {
    if (editorModel?.providerId) {
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

  const filteredModels = fetchedModels.filter(m => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.id.toLowerCase().includes(q) ||
      (m.displayName && m.displayName.toLowerCase().includes(q)) ||
      (m.description && m.description.toLowerCase().includes(q))
    );
  });

  // Get reasoning support for the current provider
  const reasoningSupport: ReasoningSupport = editorModel?.providerId
    ? getProviderReasoningSupport(editorModel.providerId)
    : 'none';
  const showReasoningSection = reasoningSupport !== 'none';
  const isAutoReasoning = reasoningSupport === 'auto';
  const showEffortOptions = reasoningSupport === 'effort' || reasoningSupport === 'dynamic';

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
    if (editorModel?.id) {
      loadPromptTemplates();
    }
  }, [editorModel?.id]);

  const loadPromptTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const templates = await listPromptTemplates();
      setPromptTemplates(templates);
    } catch (err) {
      console.error("Failed to load prompt templates:", err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handlePromptTemplateChange = (templateId: string) => {
    if (!editorModel) return;
    editorModel.promptTemplateId = templateId || null;
    handleModelNameChange(editorModel.name); // Trigger state update
  };

  const scopeOrder = ["text", "image", "audio"] as const;
  const toggleScope = (
    key: "inputScopes" | "outputScopes",
    scope: "image" | "audio",
    enabled: boolean
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
            <label className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Model Platform</label>
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
                      {providers.find(p => p.providerId === editorModel.providerId && p.label === editorModel.providerLabel)?.label
                        || editorModel.providerLabel
                        || editorModel.providerId
                        || "Select Platform..."}
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
                      const isSelected = prov.providerId === editorModel.providerId && prov.label === editorModel.providerLabel;
                      return (
                        <MenuButton
                          key={prov.id}
                          icon={getProviderIcon(prov.providerId)}
                          title={prov.label || prov.providerId}
                          description={prov.providerId}
                          color={isSelected ? "from-emerald-500 to-emerald-600" : "from-white/10 to-white/5"}
                          rightElement={isSelected ? <Check className="h-4 w-4 text-emerald-400" /> : <ChevronRight className="h-4 w-4 text-white/20" />}
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
              <label className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Display Name</label>
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
                <label className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Model ID</label>
                <div className="flex items-center gap-3">
                  {fetchedModels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsManualInput(!isManualInput)}
                      className="text-[10px] uppercase font-bold tracking-wider text-white/40 hover:text-white/80 transition"
                    >
                      {isManualInput ? "Show List" : "Manual Input"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={fetchModels}
                    disabled={fetchingModels || !editorModel?.providerId}
                    className="text-white/40 hover:text-white/80 transition disabled:opacity-30"
                    title="Refresh model list"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", fetchingModels && "animate-spin")} />
                  </button>
                </div>
              </div>

              {!isManualInput && fetchedModels.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowModelSelector(true)}
                    className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white transition hover:bg-black/30 active:scale-[0.99]"
                  >
                    <span className={cn("block truncate", !editorModel.name && "text-white/40")}>
                      {fetchedModels.find(m => m.id === editorModel.name)?.displayName || editorModel.name || "Select a model..."}
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
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Search models..."
                          className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white placeholder-white/40 focus:border-white/20 focus:outline-none"
                          autoFocus
                        />
                      </div>
                    </div>
                    <MenuSection>
                      {filteredModels.length > 0 ? (
                        filteredModels.map(m => {
                          const isSelected = m.id === editorModel.name;
                          return (
                            <MenuButton
                              key={m.id}
                              icon={getProviderIcon(editorModel.providerId)}
                              title={m.displayName || m.id}
                              description={m.description || m.id}
                              color="from-emerald-500 to-emerald-600"
                              rightElement={isSelected ? <Check className="h-4 w-4 text-emerald-400" /> : undefined}
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
                <input
                  type="text"
                  value={editorModel.name}
                  onChange={(e) => handleModelNameChange(e.target.value)}
                  placeholder="e.g. gpt-4o"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
                />
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
                  <span className="block text-[11px] text-white/40 uppercase tracking-wider">Parameters, Prompt, & Capabilities</span>
                </div>
              </div>
              <ChevronRight
                className={cn(
                  "h-5 w-5 text-white/20 transition-transform duration-300",
                  isAdvancedOpen && "rotate-90"
                )}
              />
            </button>

            {isAdvancedOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden space-y-8 pt-2 px-1"
              >
                {/* System Prompt Template */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold tracking-wider text-white/50 uppercase">System Prompt Template</label>
                  {loadingTemplates ? (
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                      <span className="text-sm text-white/50">Loading templates...</span>
                    </div>
                  ) : (
                    <div className="relative">
                      <FileText className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                      <select
                        value={editorModel.promptTemplateId || ""}
                        onChange={(e) => handlePromptTemplateChange(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 pl-10 text-sm text-white transition focus:border-white/30 focus:outline-none"
                      >
                        <option value="" className="bg-[#16171d]">Use app default</option>
                        {promptTemplates
                          .filter(t => t.name !== "App Default")
                          .map((template) => (
                            <option key={template.id} value={template.id} className="bg-[#16171d]">
                              {template.name}
                            </option>
                          ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    </div>
                  )}
                </div>

                {/* Capabilities */}
                <div className="space-y-4 rounded-2xl border border-white/5 bg-white/5 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Capabilities</p>
                      <p className="mt-1 text-xs text-white/40">Supported input/output modalities</p>
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
                      <p className="text-[10px] font-bold tracking-wider text-white/20 uppercase">Input</p>
                      {["image", "audio"].map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => toggleScope("inputScopes", scope as any, !editorModel.inputScopes?.includes(scope as any))}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition",
                            editorModel.inputScopes?.includes(scope as any)
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-black/20 text-white/40 border border-transparent"
                          )}
                        >
                          <span className="capitalize">{scope}</span>
                          {editorModel.inputScopes?.includes(scope as any) && <Check size={12} />}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <p className="text-[10px] font-bold tracking-wider text-white/20 uppercase">Output</p>
                      {["image", "audio"].map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => toggleScope("outputScopes", scope as any, !editorModel.outputScopes?.includes(scope as any))}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition",
                            editorModel.outputScopes?.includes(scope as any)
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-black/20 text-white/40 border border-transparent"
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
                    <label className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Model Parameters</label>
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
                        <div className="space-y-0.5">
                          <span className="block text-xs font-medium text-white/70">Temperature</span>
                          <span className="block text-[10px] text-white/40">Higher = more creative</span>
                        </div>
                        <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                          {modelAdvancedDraft.temperature?.toFixed(2) ?? "0.70"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={ADVANCED_TEMPERATURE_RANGE.min}
                        max={ADVANCED_TEMPERATURE_RANGE.max}
                        step={0.01}
                        value={modelAdvancedDraft.temperature ?? 0.7}
                        onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                        <span>{ADVANCED_TEMPERATURE_RANGE.min}</span>
                        <span>{ADVANCED_TEMPERATURE_RANGE.max}</span>
                      </div>
                    </div>

                    {/* Top P */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="block text-xs font-medium text-white/70">Top P</span>
                          <span className="block text-[10px] text-white/40">Lower = more focused</span>
                        </div>
                        <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                          {modelAdvancedDraft.topP?.toFixed(2) ?? "1.00"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={ADVANCED_TOP_P_RANGE.min}
                        max={ADVANCED_TOP_P_RANGE.max}
                        step={0.01}
                        value={modelAdvancedDraft.topP ?? 1}
                        onChange={(e) => handleTopPChange(parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                        <span>{ADVANCED_TOP_P_RANGE.min}</span>
                        <span>{ADVANCED_TOP_P_RANGE.max}</span>
                      </div>
                    </div>

                    {/* Max Tokens */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="block text-xs font-medium text-white/70">Max Output Tokens</span>
                          <span className="block text-[10px] text-white/40">Limit response length</span>
                        </div>
                        <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                          {modelAdvancedDraft.maxOutputTokens?.toLocaleString() ?? "Auto"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={ADVANCED_MAX_TOKENS_RANGE.max}
                        step={1}
                        value={modelAdvancedDraft.maxOutputTokens ?? 0}
                        onChange={(e) => handleMaxTokensChange(e.target.value === "0" ? null : parseInt(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                        <span>Auto (0)</span>
                        <span>{ADVANCED_MAX_TOKENS_RANGE.max.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Penalties */}
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="block text-xs font-medium text-white/70">Frequency Penalty</span>
                            <span className="block text-[10px] text-white/40">Reduce word repetition</span>
                          </div>
                          <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                            {modelAdvancedDraft.frequencyPenalty?.toFixed(2) ?? "0.00"}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={ADVANCED_FREQUENCY_PENALTY_RANGE.min}
                          max={ADVANCED_FREQUENCY_PENALTY_RANGE.max}
                          step={0.01}
                          value={modelAdvancedDraft.frequencyPenalty ?? 0}
                          onChange={(e) => handleFrequencyPenaltyChange(parseFloat(e.target.value))}
                          className="w-full"
                        />
                        <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                          <span>{ADVANCED_FREQUENCY_PENALTY_RANGE.min}</span>
                          <span>{ADVANCED_FREQUENCY_PENALTY_RANGE.max}</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="block text-xs font-medium text-white/70">Presence Penalty</span>
                            <span className="block text-[10px] text-white/40">Encourage new topics</span>
                          </div>
                          <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                            {modelAdvancedDraft.presencePenalty?.toFixed(2) ?? "0.00"}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={ADVANCED_PRESENCE_PENALTY_RANGE.min}
                          max={ADVANCED_PRESENCE_PENALTY_RANGE.max}
                          step={0.01}
                          value={modelAdvancedDraft.presencePenalty ?? 0}
                          onChange={(e) => handlePresencePenaltyChange(parseFloat(e.target.value))}
                          className="w-full"
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
                        <div className="space-y-0.5">
                          <span className="block text-xs font-medium text-white/70">Top K</span>
                          <span className="block text-[10px] text-white/40">Sample from top K tokens</span>
                        </div>
                        <span className="rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-emerald-400">
                          {modelAdvancedDraft.topK ?? "Auto"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={ADVANCED_TOP_K_RANGE.max}
                        step={1}
                        value={modelAdvancedDraft.topK ?? 0}
                        onChange={(e) => handleTopKChange(e.target.value === "0" ? null : parseInt(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                        <span>Auto (0)</span>
                        <span>{ADVANCED_TOP_K_RANGE.max}</span>
                      </div>
                    </div>

                    {/* Reasoning Section (Thinking) */}
                    {showReasoningSection && (
                      <div className="space-y-4 border-t border-white/5 pt-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Brain size={14} className="text-amber-400" />
                            <label className="text-xs font-medium text-white/70">Reasoning (Thinking)</label>
                          </div>
                          {!isAutoReasoning && (
                            <label className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200">
                              <input
                                type="checkbox"
                                checked={modelAdvancedDraft.reasoningEnabled || false}
                                onChange={(e) => handleReasoningEnabledChange(e.target.checked)}
                                className="sr-only"
                              />
                              <span className={cn(
                                "inline-block h-full w-full rounded-full transition-colors duration-200",
                                modelAdvancedDraft.reasoningEnabled ? "bg-amber-500" : "bg-white/10"
                              )} />
                              <span className={cn(
                                "absolute h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200",
                                modelAdvancedDraft.reasoningEnabled ? "translate-x-4.5" : "translate-x-1"
                              )} />
                            </label>
                          )}
                        </div>

                        {(modelAdvancedDraft.reasoningEnabled || isAutoReasoning) && (
                          <div className="space-y-6 pl-2 border-l border-white/10">
                            {showEffortOptions && (
                              <div className="space-y-3">
                                <span className="text-[10px] font-bold text-white/30 uppercase">Reasoning Effort</span>
                                <div className="grid grid-cols-4 gap-2">
                                  {([null, 'low', 'medium', 'high'] as const).map((level) => (
                                    <button
                                      key={level || 'auto'}
                                      type="button"
                                      onClick={() => handleReasoningEffortChange(level)}
                                      className={cn(
                                        "rounded-lg py-1.5 text-[10px] font-bold uppercase transition",
                                        modelAdvancedDraft.reasoningEffort === level
                                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                          : "bg-white/5 text-white/30 border border-transparent hover:text-white/50"
                                      )}
                                    >
                                      {level || 'auto'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {(reasoningSupport === 'budget-only' || reasoningSupport === 'dynamic') && (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-white/30 uppercase">Budget Tokens</span>
                                  <span className="font-mono text-xs text-amber-400">
                                    {modelAdvancedDraft.reasoningBudgetTokens?.toLocaleString() || "Auto"}
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={ADVANCED_REASONING_BUDGET_RANGE.min}
                                  max={ADVANCED_REASONING_BUDGET_RANGE.max}
                                  step={1024}
                                  value={modelAdvancedDraft.reasoningBudgetTokens || 8192}
                                  onChange={(e) => handleReasoningBudgetChange(parseInt(e.target.value))}
                                  className="w-full"
                                />
                                <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-1">
                                  <span>{ADVANCED_REASONING_BUDGET_RANGE.min.toLocaleString()}</span>
                                  <span>{ADVANCED_REASONING_BUDGET_RANGE.max.toLocaleString()}</span>
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
          <ProviderParameterSupportInfo providerId={editorModel?.providerId || 'openai'} />
        </div>
      </BottomMenu>

    </div>
  );
}
