import { Save, Loader2, Trash2, SlidersHorizontal, FileText, Info } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

import { formatAdvancedModelSettingsSummary, sanitizeAdvancedModelSettings } from "../../components/AdvancedModelSettingsForm";
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
import { useModelEditorController } from "./hooks/useModelEditorController";
import type { SystemPromptTemplate } from "../../../core/storage/schemas";
import { listPromptTemplates } from "../../../core/prompts/service";

export function EditModelPage() {
  const [promptTemplates, setPromptTemplates] = useState<SystemPromptTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showParameterSupport, setShowParameterSupport] = useState(false);

  const {
    state: {
      loading,
      saving,
      deleting,
      verifying,
      error,
      providers,
      defaultModelId,
      editorModel,
      //globalAdvanced,
      modelAdvancedDraft,
      overrideEnabled,
    },
    isNew,
    canSave,
    providerDisplay,
    handleDisplayNameChange,
    handleModelNameChange,
    handleProviderSelection,
    setModelAdvancedDraft,
    toggleOverride,
    handleTemperatureChange,
    handleTopPChange,
    handleMaxTokensChange,
    handleFrequencyPenaltyChange,
    handlePresencePenaltyChange,
    handleTopKChange,
    handleSave,
    handleDelete,
    handleSetDefault,
  } = useModelEditorController();

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

  if (loading || !editorModel) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col pb-16 text-gray-200">
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="space-y-6"
        >
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">DISPLAY NAME</label>
            <input
              type="text"
              value={editorModel.displayName}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              placeholder="GPT-4 Turbo"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
            />
            <p className="text-xs text-white/50">Friendly name shown in the UI</p>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">MODEL NAME</label>
            <input
              type="text"
              value={editorModel.name}
              onChange={(e) => handleModelNameChange(e.target.value)}
              placeholder="gpt-4o-mini, claude-3-5-sonnet, ..."
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
            />
            <p className="text-xs text-white/50">Exact model id from your provider</p>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">PROVIDER</label>
            {providers.length === 0 ? (
              <div className="rounded-xl border border-orange-400/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">
                No providers configured. Add a provider first.
              </div>
            ) : (
              <select
                value={`${editorModel.providerId}|${editorModel.providerLabel}`}
                onChange={(e) => {
                  const [providerId, providerLabel] = e.target.value.split("|");
                  const selectedProvider =
                    providers.find((p) => p.providerId === providerId && p.label === providerLabel) ||
                    providers.find((p) => p.providerId === providerId);
                  handleProviderSelection(providerId, selectedProvider?.label ?? providerLabel);
                }}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white transition focus:border-white/30 focus:outline-none"
              >
                {providers.map((prov) => (
                  <option key={prov.id} value={`${prov.providerId}|${prov.label}`} className="bg-black">
                    {providerDisplay(prov)}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-white/50">Choose provider credentials to use</p>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">MODEL TYPE</label>
            <select
              value={editorModel.modelType || "chat"}
              onChange={(e) => {
                editorModel.modelType = e.target.value as any;
                handleModelNameChange(editorModel.name); // Trigger state update
              }}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white transition focus:border-white/30 focus:outline-none"
            >
              <option value="chat" className="bg-black">Chat</option>
              <option value="multimodel" className="bg-black">Multimodel</option>
              <option value="imagegeneration" className="bg-black">Image Generation</option>
              <option value="embedding" className="bg-black">Embedding</option>
            </select>
            <p className="text-xs text-white/50">Model capability type</p>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">SYSTEM PROMPT TEMPLATE (OPTIONAL)</label>
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
                  className="w-full appearance-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 pl-9 text-white transition focus:border-white/30 focus:outline-none"
                >
                  <option value="">Use app default</option>
                  {promptTemplates
                    .filter(t => t.name !== "App Default")
                    .map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <p className="text-xs text-white/50">
              Select a custom system prompt template for this model
            </p>
          </div>

          {!isNew && (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#0b0c12]/90 p-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-white">Default Model</label>
                <p className="mt-1 text-xs text-gray-400">{defaultModelId === editorModel.id ? "This model is set as default." : "Use this model by default."}</p>
              </div>
              <div className="flex items-center">
                <input
                  id="use-as-default"
                  type="checkbox"
                  checked={defaultModelId === editorModel.id}
                  onChange={handleSetDefault}
                  disabled={defaultModelId === editorModel.id}
                  className="peer sr-only"
                />
                <label
                  htmlFor="use-as-default"
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-400/40 ${defaultModelId === editorModel.id
                    ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30'
                    : 'bg-white/20'
                    }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${defaultModelId === editorModel.id ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Advanced Settings */}
          <section className="space-y-3">
            {/* Header with Toggle */}
            <button
              onClick={toggleOverride}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left transition active:bg-white/10"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="rounded-lg border border-purple-400/30 bg-purple-400/10 p-2">
                    <SlidersHorizontal className="h-4 w-4 text-purple-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">Advanced Settings</h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowParameterSupport(true);
                        }}
                        className="group/info flex items-center justify-center rounded-full border border-blue-400/20 bg-blue-400/5 p-1.5 transition-all hover:border-blue-400/40 hover:bg-blue-400/10 hover:shadow-lg hover:shadow-blue-400/20 active:scale-95"
                        aria-label="View parameter support"
                      >
                        <Info className="h-3.5 w-3.5 text-blue-400 transition-transform group-hover/info:scale-110" />
                      </button>
                    </div>
                    {!overrideEnabled ? (
                      <p className="text-xs text-white/50 truncate">Using global defaults</p>
                    ) : (
                      <p className="text-xs text-white/50 truncate">
                        {formatAdvancedModelSettingsSummary(
                          sanitizeAdvancedModelSettings(modelAdvancedDraft),
                          "Custom settings",
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center shrink-0">
                  <div
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-all duration-200 ${overrideEnabled
                      ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30'
                      : 'bg-white/20'
                      }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${overrideEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                  </div>
                </div>
              </div>
            </button>

            {/* Expanded Settings */}
            {overrideEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {/* Temperature */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-white">Temperature</label>
                      <p className="mt-0.5 text-xs text-white/50">Controls randomness and creativity</p>
                    </div>
                    <span className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-sm font-mono font-semibold text-emerald-200">
                      {modelAdvancedDraft.temperature?.toFixed(2) ?? "0.70"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={ADVANCED_TEMPERATURE_RANGE.min}
                    max={ADVANCED_TEMPERATURE_RANGE.max}
                    step={0.01}
                    value={modelAdvancedDraft.temperature ?? 0.7}
                    onChange={(e) => handleTemperatureChange(Number(e.target.value))}
                    className="w-full"
                    style={{
                      background: `linear-gradient(to right, rgb(52, 211, 153) 0%, rgb(52, 211, 153) ${((modelAdvancedDraft.temperature ?? 0.7) / ADVANCED_TEMPERATURE_RANGE.max) * 100}%, rgba(255,255,255,0.1) ${((modelAdvancedDraft.temperature ?? 0.7) / ADVANCED_TEMPERATURE_RANGE.max) * 100}%, rgba(255,255,255,0.1) 100%)`
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
                      {modelAdvancedDraft.topP?.toFixed(2) ?? "1.00"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={ADVANCED_TOP_P_RANGE.min}
                    max={ADVANCED_TOP_P_RANGE.max}
                    step={0.01}
                    value={modelAdvancedDraft.topP ?? 1}
                    onChange={(e) => handleTopPChange(Number(e.target.value))}
                    className="w-full"
                    style={{
                      background: `linear-gradient(to right, rgb(96, 165, 250) 0%, rgb(96, 165, 250) ${((modelAdvancedDraft.topP ?? 1) / ADVANCED_TOP_P_RANGE.max) * 100}%, rgba(255,255,255,0.1) ${((modelAdvancedDraft.topP ?? 1) / ADVANCED_TOP_P_RANGE.max) * 100}%, rgba(255,255,255,0.1) 100%)`
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
                      onClick={() => handleMaxTokensChange(null as any)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${!modelAdvancedDraft.maxOutputTokens
                        ? 'border border-purple-400/40 bg-purple-400/20 text-purple-200'
                        : 'border border-white/10 bg-white/5 text-white/60 active:bg-white/10'
                        }`}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMaxTokensChange(1024)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${modelAdvancedDraft.maxOutputTokens
                        ? 'border border-purple-400/40 bg-purple-400/20 text-purple-200'
                        : 'border border-white/10 bg-white/5 text-white/60 active:bg-white/10'
                        }`}
                    >
                      Custom
                    </button>
                  </div>

                  {modelAdvancedDraft.maxOutputTokens !== null && modelAdvancedDraft.maxOutputTokens !== undefined && (
                    <input
                      type="number"
                      inputMode="numeric"
                      min={ADVANCED_MAX_TOKENS_RANGE.min}
                      max={ADVANCED_MAX_TOKENS_RANGE.max}
                      value={modelAdvancedDraft.maxOutputTokens ?? ''}
                      onChange={(e) => handleMaxTokensChange(Number(e.target.value))}
                      placeholder="1024"
                      className="w-full rounded-lg border border-white/10 bg-black/20 px-3.5 py-3 text-base text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
                    />
                  )}

                  <p className="mt-2 text-xs text-white/40">
                    {!modelAdvancedDraft.maxOutputTokens
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
                      {modelAdvancedDraft.frequencyPenalty?.toFixed(2) ?? "0.00"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={ADVANCED_FREQUENCY_PENALTY_RANGE.min}
                    max={ADVANCED_FREQUENCY_PENALTY_RANGE.max}
                    step={0.01}
                    value={modelAdvancedDraft.frequencyPenalty ?? 0}
                    onChange={(e) => handleFrequencyPenaltyChange(Number(e.target.value))}
                    className="w-full"
                    style={{
                      background: `linear-gradient(to right, rgb(251, 146, 60) 0%, rgb(251, 146, 60) ${((modelAdvancedDraft.frequencyPenalty ?? 0) + 2) / 4 * 100}%, rgba(255,255,255,0.1) ${((modelAdvancedDraft.frequencyPenalty ?? 0) + 2) / 4 * 100}%, rgba(255,255,255,0.1) 100%)`
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
                      {modelAdvancedDraft.presencePenalty?.toFixed(2) ?? "0.00"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={ADVANCED_PRESENCE_PENALTY_RANGE.min}
                    max={ADVANCED_PRESENCE_PENALTY_RANGE.max}
                    step={0.01}
                    value={modelAdvancedDraft.presencePenalty ?? 0}
                    onChange={(e) => handlePresencePenaltyChange(Number(e.target.value))}
                    className="w-full"
                    style={{
                      background: `linear-gradient(to right, rgb(244, 114, 182) 0%, rgb(244, 114, 182) ${((modelAdvancedDraft.presencePenalty ?? 0) + 2) / 4 * 100}%, rgba(255,255,255,0.1) ${((modelAdvancedDraft.presencePenalty ?? 0) + 2) / 4 * 100}%, rgba(255,255,255,0.1) 100%)`
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
                    value={modelAdvancedDraft.topK ?? ''}
                    onChange={(e) => handleTopKChange(e.target.value === '' ? null : Number(e.target.value))}
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
                      onClick={() => setModelAdvancedDraft({ temperature: 0.2, topP: 0.9, maxOutputTokens: 512 })}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center transition active:scale-95 active:bg-white/10"
                    >
                      <div className="text-xs font-semibold text-white">Precise</div>
                      <div className="mt-0.5 text-[10px] text-white/50">Focused</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelAdvancedDraft({ temperature: 0.7, topP: 1.0, maxOutputTokens: 1024 })}
                      className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2.5 text-center transition active:scale-95 active:bg-emerald-400/20"
                    >
                      <div className="text-xs font-semibold text-emerald-200">Balanced</div>
                      <div className="mt-0.5 text-[10px] text-emerald-300/60">Default</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelAdvancedDraft({ temperature: 0.9, topP: 1.0, maxOutputTokens: 1024 })}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center transition active:scale-95 active:bg-white/10"
                    >
                      <div className="text-xs font-semibold text-white">Creative</div>
                      <div className="mt-0.5 text-[10px] text-white/50">Random</div>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </section>

          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`w-full rounded-xl px-4 py-3 text-sm font-medium transition active:scale-[0.99] ${canSave
              ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30"
              : "border border-white/10 bg-white/5 text-white/30"
              }`}
          >
            {saving || verifying ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {verifying ? "Verifying..." : "Saving..."}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </span>
            )}
          </button>

          {!isNew && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-100 transition hover:border-rose-400/50 hover:bg-rose-500/20 active:scale-[0.99] disabled:opacity-50"
            >
              <span className="flex items-center justify-center gap-2">
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deleting ? "Deleting..." : "Delete Model"}
              </span>
            </button>
          )}
        </motion.div>
      </main>

      {/* Parameter Support Bottom Menu */}
      <BottomMenu
        isOpen={showParameterSupport}
        onClose={() => setShowParameterSupport(false)}
        title={`Parameter Support - ${providerDisplay(providers.find(p => p.providerId === editorModel?.providerId) ?? providers[0]).split('(')[0]}`}
      >
        <ProviderParameterSupportInfo providerId={editorModel?.providerId || 'openai'} />
      </BottomMenu>
    </div>
  );
}
