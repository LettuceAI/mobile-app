import { Save, Loader2, Trash2, SlidersHorizontal, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

import { formatAdvancedModelSettingsSummary, sanitizeAdvancedModelSettings } from "../../components/AdvancedModelSettingsForm";
import {
  ADVANCED_TEMPERATURE_RANGE,
  ADVANCED_TOP_P_RANGE,
  ADVANCED_MAX_TOKENS_RANGE,
} from "../../components/AdvancedModelSettingsForm";
import { useModelEditorController } from "./hooks/useModelEditorController";
import type { SystemPromptTemplate } from "../../../core/storage/schemas";
import { listPromptTemplates } from "../../../core/prompts/service";

export function EditModelPage() {
  const [promptTemplates, setPromptTemplates] = useState<SystemPromptTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

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
      globalAdvanced,
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
                  <option value="">Use app default prompt</option>
                  {promptTemplates.map((template) => (
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
            {/* Header */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <SlidersHorizontal className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-white">Advanced Settings</h2>
                    <p className="text-xs text-white/50 truncate">
                      {formatAdvancedModelSettingsSummary(
                        overrideEnabled ? sanitizeAdvancedModelSettings(modelAdvancedDraft) : globalAdvanced,
                        "Inherits global defaults",
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    id="overwrite-advanced-settings"
                    type="checkbox"
                    onChange={toggleOverride}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor="overwrite-advanced-settings"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-400/40 ${overrideEnabled
                      ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30'
                      : 'bg-white/20'
                      }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${overrideEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Controls */}
            {overrideEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4"
              >
                {/* Temperature */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-medium uppercase tracking-wider text-white/70">
                      Temperature
                    </label>
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/90">
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
                    className="h-2 w-full appearance-none cursor-pointer rounded-full bg-white/10 outline-none transition-all 
          focus:ring-2 focus:ring-emerald-400/40 focus:ring-offset-2 focus:ring-offset-[#050505]
          [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/10
          [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/10
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-400/40 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-emerald-400 [&::-webkit-slider-thumb]:to-emerald-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-emerald-400/20 [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:scale-95 [&::-webkit-slider-thumb]:mt-[-6px]
          [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-400/40 [&::-moz-range-thumb]:bg-gradient-to-br [&::-moz-range-thumb]:from-emerald-400 [&::-moz-range-thumb]:to-emerald-500 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:shadow-emerald-400/20 [&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-thumb]:active:scale-95"
                  />
                  <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
                    <span>{ADVANCED_TEMPERATURE_RANGE.min}</span>
                    <span>{ADVANCED_TEMPERATURE_RANGE.max}</span>
                  </div>
                </div>

                {/* Top P */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-medium uppercase tracking-wider text-white/70">
                      Top P
                    </label>
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/90">
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
                    className="h-2 w-full appearance-none cursor-pointer rounded-full bg-white/10 outline-none transition-all 
          focus:ring-2 focus:ring-emerald-400/40 focus:ring-offset-2 focus:ring-offset-[#050505]
          [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/10
          [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/10
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-400/40 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-emerald-400 [&::-webkit-slider-thumb]:to-emerald-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-emerald-400/20 [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:scale-95 [&::-webkit-slider-thumb]:mt-[-6px]
          [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-400/40 [&::-moz-range-thumb]:bg-gradient-to-br [&::-moz-range-thumb]:from-emerald-400 [&::-moz-range-thumb]:to-emerald-500 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:shadow-emerald-400/20 [&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-thumb]:active:scale-95"
                  />
                  <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
                    <span>{ADVANCED_TOP_P_RANGE.min}</span>
                    <span>{ADVANCED_TOP_P_RANGE.max}</span>
                  </div>
                </div>

                {/* Max Tokens */}
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-white/70">
                    Max Tokens
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    min={ADVANCED_MAX_TOKENS_RANGE.min}
                    max={ADVANCED_MAX_TOKENS_RANGE.max}
                    value={modelAdvancedDraft.maxOutputTokens ?? ''}
                    onChange={(e) => handleMaxTokensChange(Number(e.target.value))}
                    placeholder="1024"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-white/50">
                    Suggested range: {ADVANCED_MAX_TOKENS_RANGE.min} - {ADVANCED_MAX_TOKENS_RANGE.max}
                  </p>
                </div>

                {/* Presets */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setModelAdvancedDraft({ temperature: 0.7, topP: 1.0, maxOutputTokens: 1024 })}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-emerald-400/50 hover:text-white"
                  >
                    Balanced
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelAdvancedDraft({ temperature: 0.9, topP: 1.0, maxOutputTokens: 1024 })}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-emerald-400/50 hover:text-white"
                  >
                    Creative
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelAdvancedDraft({ temperature: 0.2, topP: 0.9, maxOutputTokens: 512 })}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-emerald-400/50 hover:text-white"
                  >
                    Precise
                  </button>
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
    </div>
  );
}
