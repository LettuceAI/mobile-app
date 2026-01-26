import type { ChangeEvent } from "react";
import { Brain, Info } from "lucide-react";
import type { AdvancedModelSettings, ReasoningSupport } from "../../core/storage/schemas";
import { cn } from "../design-tokens";

export const ADVANCED_TEMPERATURE_RANGE = { min: 0, max: 2 };
export const ADVANCED_TOP_P_RANGE = { min: 0, max: 1 };
export const ADVANCED_MAX_TOKENS_RANGE = { min: 0, max: 32768 };
export const ADVANCED_CONTEXT_LENGTH_RANGE = { min: 0, max: 262144 };
export const ADVANCED_FREQUENCY_PENALTY_RANGE = { min: -2, max: 2 };
export const ADVANCED_PRESENCE_PENALTY_RANGE = { min: -2, max: 2 };
export const ADVANCED_TOP_K_RANGE = { min: 1, max: 500 };
export const ADVANCED_REASONING_BUDGET_RANGE = { min: 1024, max: 32768 };
export const ADVANCED_LLAMA_GPU_LAYERS_RANGE = { min: 0, max: 512 };
export const ADVANCED_LLAMA_THREADS_RANGE = { min: 1, max: 256 };
export const ADVANCED_LLAMA_THREADS_BATCH_RANGE = { min: 1, max: 256 };
export const ADVANCED_LLAMA_SEED_RANGE = { min: 0, max: 2_147_483_647 };
export const ADVANCED_LLAMA_ROPE_FREQ_BASE_RANGE = { min: 0, max: 1_000_000 };
export const ADVANCED_LLAMA_ROPE_FREQ_SCALE_RANGE = { min: 0, max: 10 };
export const ADVANCED_OLLAMA_NUM_CTX_RANGE = { min: 0, max: 262_144 };
export const ADVANCED_OLLAMA_NUM_PREDICT_RANGE = { min: 0, max: 131_072 };
export const ADVANCED_OLLAMA_NUM_KEEP_RANGE = { min: 0, max: 32_768 };
export const ADVANCED_OLLAMA_NUM_BATCH_RANGE = { min: 1, max: 16_384 };
export const ADVANCED_OLLAMA_NUM_GPU_RANGE = { min: 0, max: 512 };
export const ADVANCED_OLLAMA_NUM_THREAD_RANGE = { min: 1, max: 256 };
export const ADVANCED_OLLAMA_TFS_Z_RANGE = { min: 0, max: 1 };
export const ADVANCED_OLLAMA_TYPICAL_P_RANGE = { min: 0, max: 1 };
export const ADVANCED_OLLAMA_MIN_P_RANGE = { min: 0, max: 1 };
export const ADVANCED_OLLAMA_MIROSTAT_RANGE = { min: 0, max: 2 };
export const ADVANCED_OLLAMA_MIROSTAT_TAU_RANGE = { min: 0, max: 10 };
export const ADVANCED_OLLAMA_MIROSTAT_ETA_RANGE = { min: 0, max: 1 };
export const ADVANCED_OLLAMA_REPEAT_PENALTY_RANGE = { min: 0, max: 2 };
export const ADVANCED_OLLAMA_SEED_RANGE = { min: 0, max: 2_147_483_647 };

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function sanitizeAdvancedModelSettings(input: AdvancedModelSettings): AdvancedModelSettings {
  const sanitize = (
    value: number | null | undefined,
    range: { min: number; max: number },
    toInteger = false,
  ) => {
    if (value === null || value === undefined) {
      return null;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    const clamped = clampValue(numeric, range.min, range.max);
    return toInteger ? Math.round(clamped) : Number(clamped.toFixed(3));
  };

  const normalizeStop = (value: unknown): string[] | null => {
    if (!Array.isArray(value)) return null;
    const cleaned = value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v.length > 0);
    return cleaned.length > 0 ? cleaned : null;
  };

  return {
    temperature: sanitize(input.temperature, ADVANCED_TEMPERATURE_RANGE, false),
    topP: sanitize(input.topP, ADVANCED_TOP_P_RANGE, false),
    maxOutputTokens: sanitize(input.maxOutputTokens, ADVANCED_MAX_TOKENS_RANGE, true),
    contextLength: sanitize(input.contextLength, ADVANCED_CONTEXT_LENGTH_RANGE, true),
    frequencyPenalty: sanitize(input.frequencyPenalty, ADVANCED_FREQUENCY_PENALTY_RANGE, false),
    presencePenalty: sanitize(input.presencePenalty, ADVANCED_PRESENCE_PENALTY_RANGE, false),
    topK: sanitize(input.topK, ADVANCED_TOP_K_RANGE, true),
    llamaGpuLayers: sanitize(input.llamaGpuLayers, ADVANCED_LLAMA_GPU_LAYERS_RANGE, true),
    llamaThreads: sanitize(input.llamaThreads, ADVANCED_LLAMA_THREADS_RANGE, true),
    llamaThreadsBatch: sanitize(input.llamaThreadsBatch, ADVANCED_LLAMA_THREADS_BATCH_RANGE, true),
    llamaSeed: sanitize(input.llamaSeed, ADVANCED_LLAMA_SEED_RANGE, true),
    llamaRopeFreqBase: sanitize(
      input.llamaRopeFreqBase,
      ADVANCED_LLAMA_ROPE_FREQ_BASE_RANGE,
      false,
    ),
    llamaRopeFreqScale: sanitize(
      input.llamaRopeFreqScale,
      ADVANCED_LLAMA_ROPE_FREQ_SCALE_RANGE,
      false,
    ),
    llamaOffloadKqv: input.llamaOffloadKqv ?? null,
    ollamaNumCtx: sanitize(input.ollamaNumCtx, ADVANCED_OLLAMA_NUM_CTX_RANGE, true),
    ollamaNumPredict: sanitize(input.ollamaNumPredict, ADVANCED_OLLAMA_NUM_PREDICT_RANGE, true),
    ollamaNumKeep: sanitize(input.ollamaNumKeep, ADVANCED_OLLAMA_NUM_KEEP_RANGE, true),
    ollamaNumBatch: sanitize(input.ollamaNumBatch, ADVANCED_OLLAMA_NUM_BATCH_RANGE, true),
    ollamaNumGpu: sanitize(input.ollamaNumGpu, ADVANCED_OLLAMA_NUM_GPU_RANGE, true),
    ollamaNumThread: sanitize(input.ollamaNumThread, ADVANCED_OLLAMA_NUM_THREAD_RANGE, true),
    ollamaTfsZ: sanitize(input.ollamaTfsZ, ADVANCED_OLLAMA_TFS_Z_RANGE, false),
    ollamaTypicalP: sanitize(input.ollamaTypicalP, ADVANCED_OLLAMA_TYPICAL_P_RANGE, false),
    ollamaMinP: sanitize(input.ollamaMinP, ADVANCED_OLLAMA_MIN_P_RANGE, false),
    ollamaMirostat: sanitize(input.ollamaMirostat, ADVANCED_OLLAMA_MIROSTAT_RANGE, true),
    ollamaMirostatTau: sanitize(input.ollamaMirostatTau, ADVANCED_OLLAMA_MIROSTAT_TAU_RANGE, false),
    ollamaMirostatEta: sanitize(input.ollamaMirostatEta, ADVANCED_OLLAMA_MIROSTAT_ETA_RANGE, false),
    ollamaRepeatPenalty: sanitize(
      input.ollamaRepeatPenalty,
      ADVANCED_OLLAMA_REPEAT_PENALTY_RANGE,
      false,
    ),
    ollamaSeed: sanitize(input.ollamaSeed, ADVANCED_OLLAMA_SEED_RANGE, true),
    ollamaStop: normalizeStop(input.ollamaStop),
    reasoningEnabled: input.reasoningEnabled ?? null,
    reasoningEffort: input.reasoningEffort ?? null,
    reasoningBudgetTokens: sanitize(
      input.reasoningBudgetTokens,
      ADVANCED_REASONING_BUDGET_RANGE,
      true,
    ),
  };
}

export function formatAdvancedModelSettingsSummary(
  settings: AdvancedModelSettings | null | undefined,
  fallbackLabel: string,
): string {
  if (!settings) {
    return fallbackLabel;
  }

  const formatValue = (value: number | null | undefined, digits = 2): string | null => {
    if (
      value === null ||
      value === undefined ||
      typeof value !== "number" ||
      !Number.isFinite(value)
    ) {
      return null;
    }
    return value % 1 === 0 ? value.toString() : Number(value).toFixed(digits);
  };

  const parts: string[] = [];
  const temperatureValue = formatValue(settings.temperature);
  if (temperatureValue) {
    parts.push(`Temp ${temperatureValue}`);
  }

  const topPValue = formatValue(settings.topP);
  if (topPValue) {
    parts.push(`Top P ${topPValue}`);
  }

  const maxTokensValue = formatValue(settings.maxOutputTokens, 0);
  if (maxTokensValue) {
    parts.push(`Max ${maxTokensValue}`);
  }

  const contextValue = formatValue(settings.contextLength, 0);
  if (contextValue) {
    parts.push(`Ctx ${contextValue}`);
  }

  const freqPenaltyValue = formatValue(settings.frequencyPenalty);
  if (freqPenaltyValue) {
    parts.push(`Freq ${freqPenaltyValue}`);
  }

  const presPenaltyValue = formatValue(settings.presencePenalty);
  if (presPenaltyValue) {
    parts.push(`Pres ${presPenaltyValue}`);
  }

  const topKValue = formatValue(settings.topK, 0);
  if (topKValue) {
    parts.push(`Top-K ${topKValue}`);
  }

  // Reasoning settings
  if (settings.reasoningEnabled === false) {
    parts.push("Reasoning: Off");
  } else if (settings.reasoningEnabled) {
    if (settings.reasoningEffort) {
      parts.push(`Reasoning: ${settings.reasoningEffort}`);
    }
    const budgetValue = formatValue(settings.reasoningBudgetTokens, 0);
    if (budgetValue) {
      parts.push(`Budget: ${budgetValue}`);
    }
  }

  return parts.length ? parts.join(" • ") : fallbackLabel;
}

interface AdvancedModelSettingsFormProps {
  settings: AdvancedModelSettings;
  onChange: (settings: AdvancedModelSettings) => void;
  disabled?: boolean;
  /** The reasoning support type for the current provider */
  reasoningSupport?: ReasoningSupport;
}

export function AdvancedModelSettingsForm({
  settings,
  onChange,
  disabled,
  reasoningSupport = "none",
}: AdvancedModelSettingsFormProps) {
  const handleNumberChange =
    (key: keyof AdvancedModelSettings) => (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      const nextValue = raw === "" ? null : Number(raw);
      onChange({
        ...settings,
        [key]: nextValue,
      });
    };
  const inputClassName =
    "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none disabled:opacity-50";

  // Check if we should show effort options
  const showEffortOptions = reasoningSupport === "effort" || reasoningSupport === "dynamic";
  const showReasoningSection = reasoningSupport !== "none";
  const isAutoReasoning = reasoningSupport === "auto";

  return (
    <div className="space-y-4">
      {/* Temperature */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-white/70">
              Temperature
            </label>
            <p className="mt-0.5 text-[11px] text-white/50">Higher = more creative</p>
          </div>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/90">
            {settings.temperature?.toFixed(2) ?? "0.70"}
          </span>
        </div>
        <input
          type="number"
          inputMode="decimal"
          min={ADVANCED_TEMPERATURE_RANGE.min}
          max={ADVANCED_TEMPERATURE_RANGE.max}
          step={0.01}
          value={settings.temperature ?? ""}
          onChange={handleNumberChange("temperature")}
          disabled={disabled}
          placeholder="0.70"
          className={inputClassName}
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
          <span>{ADVANCED_TEMPERATURE_RANGE.min}</span>
          <span>{ADVANCED_TEMPERATURE_RANGE.max}</span>
        </div>
      </div>

      {/* Top P */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-white/70">
              Top P
            </label>
            <p className="mt-0.5 text-[11px] text-white/50">Lower = more focused</p>
          </div>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/90">
            {settings.topP?.toFixed(2) ?? "1.00"}
          </span>
        </div>
        <input
          type="number"
          inputMode="decimal"
          min={ADVANCED_TOP_P_RANGE.min}
          max={ADVANCED_TOP_P_RANGE.max}
          step={0.01}
          value={settings.topP ?? ""}
          onChange={handleNumberChange("topP")}
          disabled={disabled}
          placeholder="1.00"
          className={inputClassName}
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
          <span>{ADVANCED_TOP_P_RANGE.min}</span>
          <span>{ADVANCED_TOP_P_RANGE.max}</span>
        </div>
      </div>

      {/* Max Output Tokens */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-white/70">
              Max Output Tokens
            </label>
            <p className="mt-0.5 text-[11px] text-white/50">Leave blank for default</p>
          </div>
        </div>
        <input
          type="number"
          min={ADVANCED_MAX_TOKENS_RANGE.min}
          max={ADVANCED_MAX_TOKENS_RANGE.max}
          value={settings.maxOutputTokens ?? ""}
          onChange={handleNumberChange("maxOutputTokens")}
          disabled={disabled}
          placeholder="1024"
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* Context Length */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-white/70">
              Context Length
            </label>
            <p className="mt-0.5 text-[11px] text-white/50">Local models only</p>
          </div>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/90">
            {settings.contextLength ? settings.contextLength : "Auto"}
          </span>
        </div>
        <input
          type="number"
          min={ADVANCED_CONTEXT_LENGTH_RANGE.min}
          max={ADVANCED_CONTEXT_LENGTH_RANGE.max}
          value={settings.contextLength ?? ""}
          onChange={(event) => {
            const raw = event.target.value;
            const nextValue = raw === "" ? null : Number(raw);
            onChange({
              ...settings,
              contextLength:
                nextValue === null || !Number.isFinite(nextValue) || nextValue === 0
                  ? null
                  : Math.trunc(nextValue),
            });
          }}
          disabled={disabled}
          placeholder="Auto"
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none disabled:opacity-50"
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
          <span>Auto</span>
          <span>{ADVANCED_CONTEXT_LENGTH_RANGE.max.toLocaleString()}</span>
        </div>
      </div>

      {/* Frequency Penalty */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-white/70">
              Frequency Penalty
            </label>
            <p className="mt-0.5 text-[11px] text-white/50">Reduce repetition of tokens</p>
          </div>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/90">
            {settings.frequencyPenalty?.toFixed(2) ?? "0.00"}
          </span>
        </div>
        <input
          type="number"
          inputMode="decimal"
          min={ADVANCED_FREQUENCY_PENALTY_RANGE.min}
          max={ADVANCED_FREQUENCY_PENALTY_RANGE.max}
          step={0.01}
          value={settings.frequencyPenalty ?? ""}
          onChange={handleNumberChange("frequencyPenalty")}
          disabled={disabled}
          placeholder="0.00"
          className={inputClassName}
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
          <span>{ADVANCED_FREQUENCY_PENALTY_RANGE.min}</span>
          <span>{ADVANCED_FREQUENCY_PENALTY_RANGE.max}</span>
        </div>
      </div>

      {/* Presence Penalty */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-white/70">
              Presence Penalty
            </label>
            <p className="mt-0.5 text-[11px] text-white/50">Encourage new topics</p>
          </div>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/90">
            {settings.presencePenalty?.toFixed(2) ?? "0.00"}
          </span>
        </div>
        <input
          type="number"
          inputMode="decimal"
          min={ADVANCED_PRESENCE_PENALTY_RANGE.min}
          max={ADVANCED_PRESENCE_PENALTY_RANGE.max}
          step={0.01}
          value={settings.presencePenalty ?? ""}
          onChange={handleNumberChange("presencePenalty")}
          disabled={disabled}
          placeholder="0.00"
          className={inputClassName}
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
          <span>{ADVANCED_PRESENCE_PENALTY_RANGE.min}</span>
          <span>{ADVANCED_PRESENCE_PENALTY_RANGE.max}</span>
        </div>
      </div>

      {/* Top K */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-white/70">
              Top K
            </label>
            <p className="mt-0.5 text-[11px] text-white/50">Limit token pool size</p>
          </div>
        </div>
        <input
          type="number"
          min={ADVANCED_TOP_K_RANGE.min}
          max={ADVANCED_TOP_K_RANGE.max}
          value={settings.topK ?? ""}
          onChange={handleNumberChange("topK")}
          disabled={disabled}
          placeholder="40"
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* Reasoning / Thinking Section */}
      {showReasoningSection && (
        <div className="space-y-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <Brain className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold">Thinking / Reasoning</h3>
            </div>

            {!isAutoReasoning && (
              <button
                type="button"
                onClick={() =>
                  onChange({ ...settings, reasoningEnabled: !settings.reasoningEnabled })
                }
                disabled={disabled}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50",
                  settings.reasoningEnabled ? "bg-amber-500" : "bg-white/10",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    settings.reasoningEnabled ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            )}
          </div>

          <p className="text-[11px] text-white/50 leading-relaxed">
            {isAutoReasoning
              ? "This model always uses reasoning. No configuration needed."
              : "Enable advanced thinking capabilities for complex problem solving and reasoning tasks."}
          </p>

          {(settings.reasoningEnabled || isAutoReasoning) && (
            <div className="space-y-4 pt-2">
              {/* Mode Toggle for Dynamic Support (OpenRouter) - exclusive choice */}
              {reasoningSupport === "dynamic" &&
                (() => {
                  // Explicit mode detection: budget mode is active when budget has a truthy value AND effort is null/undefined
                  const isBudgetMode =
                    Boolean(settings.reasoningBudgetTokens) && !settings.reasoningEffort;

                  return (
                    <>
                      <div className="flex gap-2 p-1 rounded-xl bg-black/30 border border-white/5">
                        <button
                          type="button"
                          onClick={() => onChange({ ...settings, reasoningBudgetTokens: null })}
                          className={cn(
                            "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                            !isBudgetMode
                              ? "bg-amber-500/20 text-amber-200 border border-amber-500/30"
                              : "text-white/40 hover:text-white/60",
                          )}
                        >
                          Effort Mode
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onChange({
                              ...settings,
                              reasoningEffort: null,
                              reasoningBudgetTokens: 8192,
                            })
                          }
                          className={cn(
                            "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                            isBudgetMode
                              ? "bg-amber-500/20 text-amber-200 border border-amber-500/30"
                              : "text-white/40 hover:text-white/60",
                          )}
                        >
                          Budget Mode
                        </button>
                      </div>

                      {/* Effort controls - shown when NOT in budget mode */}
                      {!isBudgetMode && (
                        <div className="rounded-xl border border-amber-400/30 bg-black/20 p-4">
                          <div className="mb-3">
                            <label className="text-xs font-medium uppercase tracking-wider text-amber-200/80">
                              Reasoning Effort
                            </label>
                            <p className="mt-0.5 text-[11px] text-white/50">
                              Controls thinking depth
                            </p>
                          </div>

                          <div className="grid grid-cols-4 gap-2">
                            {[
                              { value: null, label: "Auto" },
                              { value: "low" as const, label: "Low" },
                              { value: "medium" as const, label: "Med" },
                              { value: "high" as const, label: "High" },
                            ].map(({ value, label }) => (
                              <button
                                key={label}
                                type="button"
                                onClick={() => onChange({ ...settings, reasoningEffort: value })}
                                disabled={disabled}
                                className={cn(
                                  "rounded-lg border px-2 py-2 text-xs font-medium transition-all active:scale-[0.98] disabled:opacity-50",
                                  settings.reasoningEffort === value
                                    ? "border-amber-400/40 bg-amber-400/20 text-amber-100"
                                    : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Budget controls - shown when IN budget mode */}
                      {isBudgetMode && (
                        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                          <div className="mb-3">
                            <label className="text-xs font-medium uppercase tracking-wider text-white/70">
                              Reasoning Budget (tokens)
                            </label>
                            <p className="mt-0.5 text-[11px] text-white/50">
                              Max tokens reserved for thinking
                            </p>
                          </div>
                          <input
                            type="number"
                            min={ADVANCED_REASONING_BUDGET_RANGE.min}
                            max={ADVANCED_REASONING_BUDGET_RANGE.max}
                            value={settings.reasoningBudgetTokens ?? ""}
                            onChange={handleNumberChange("reasoningBudgetTokens")}
                            disabled={disabled}
                            placeholder="8192"
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none disabled:opacity-50"
                          />
                        </div>
                      )}
                    </>
                  );
                })()}

              {/* Non-dynamic providers: show effort options if supported */}
              {reasoningSupport !== "dynamic" && showEffortOptions && (
                <div className="rounded-xl border border-amber-400/30 bg-black/20 p-4">
                  <div className="mb-3">
                    <label className="text-xs font-medium uppercase tracking-wider text-amber-200/80">
                      Reasoning Effort
                    </label>
                    <p className="mt-0.5 text-[11px] text-white/50">Controls thinking depth</p>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => onChange({ ...settings, reasoningEffort: null })}
                      disabled={disabled}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs font-medium transition-all active:scale-[0.98] disabled:opacity-50",
                        settings.reasoningEffort === null
                          ? "border-amber-400/40 bg-amber-400/20 text-amber-100"
                          : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      Auto
                    </button>
                    {(["low", "medium", "high"] as const).map((effort) => (
                      <button
                        key={effort}
                        type="button"
                        onClick={() => onChange({ ...settings, reasoningEffort: effort })}
                        disabled={disabled}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-xs font-medium transition-all active:scale-[0.98] disabled:opacity-50 capitalize",
                          settings.reasoningEffort === effort
                            ? "border-amber-400/40 bg-amber-400/20 text-amber-100"
                            : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        {effort}
                      </button>
                    ))}
                  </div>

                  {settings.reasoningEffort && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-black/30 p-2">
                      <Info className="h-3 w-3 shrink-0 text-amber-400/60 mt-0.5" />
                      <p className="text-[10px] text-white/40">
                        {settings.reasoningEffort === "low" &&
                          "Quick responses with minimal reasoning"}
                        {settings.reasoningEffort === "medium" && "Balanced reasoning depth"}
                        {settings.reasoningEffort === "high" &&
                          "Maximum reasoning depth for complex problems"}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Non-dynamic providers: show budget if budget-only */}
              {reasoningSupport === "budget-only" && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3">
                    <label className="text-xs font-medium uppercase tracking-wider text-white/70">
                      Reasoning Budget (tokens)
                    </label>
                    <p className="mt-0.5 text-[11px] text-white/50">
                      Max tokens reserved for thinking. Added to output limit.
                    </p>
                  </div>
                  <input
                    type="number"
                    min={ADVANCED_REASONING_BUDGET_RANGE.min}
                    max={ADVANCED_REASONING_BUDGET_RANGE.max}
                    value={settings.reasoningBudgetTokens ?? ""}
                    onChange={handleNumberChange("reasoningBudgetTokens")}
                    disabled={disabled}
                    placeholder="8192"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none disabled:opacity-50"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
