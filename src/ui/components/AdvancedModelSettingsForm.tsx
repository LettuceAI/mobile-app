import type { ChangeEvent } from "react";
import type { AdvancedModelSettings } from "../../core/storage/schemas";

export const ADVANCED_TEMPERATURE_RANGE = { min: 0, max: 2 };
export const ADVANCED_TOP_P_RANGE = { min: 0, max: 1 };
export const ADVANCED_MAX_TOKENS_RANGE = { min: 1, max: 32768 };

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function sanitizeAdvancedModelSettings(
  input: AdvancedModelSettings,
): AdvancedModelSettings {
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

  return {
    temperature: sanitize(input.temperature, ADVANCED_TEMPERATURE_RANGE, false),
    topP: sanitize(input.topP, ADVANCED_TOP_P_RANGE, false),
    maxOutputTokens: sanitize(input.maxOutputTokens, ADVANCED_MAX_TOKENS_RANGE, true),
  };
}

export function formatAdvancedModelSettingsSummary(
  settings: AdvancedModelSettings | null | undefined,
  fallbackLabel: string,
): string {
  if (!settings) {
    return fallbackLabel;
  }

  const formatValue = (
    value: number | null | undefined,
    digits = 2,
  ): string | null => {
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

  return parts.length ? parts.join(" • ") : fallbackLabel;
}

interface AdvancedModelSettingsFormProps {
  settings: AdvancedModelSettings;
  onChange: (settings: AdvancedModelSettings) => void;
  disabled?: boolean;
}

export function AdvancedModelSettingsForm({
  settings,
  onChange,
  disabled,
}: AdvancedModelSettingsFormProps) {
  const handleSliderChange =
    (key: keyof AdvancedModelSettings) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      onChange({
        ...settings,
        [key]: value,
      });
    };

  const handleNumberChange =
    (key: keyof AdvancedModelSettings) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      const nextValue = raw === "" ? null : Number(raw);
      onChange({
        ...settings,
        [key]: nextValue,
      });
    };

  return (
    <div className="space-y-4">
      {/* Temperature */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-white/70">Temperature</label>
            <p className="mt-0.5 text-[11px] text-white/50">Higher = more creative</p>
          </div>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/90">
            {settings.temperature?.toFixed(2) ?? '0.70'}
          </span>
        </div>
        <input
          type="range"
          min={ADVANCED_TEMPERATURE_RANGE.min}
          max={ADVANCED_TEMPERATURE_RANGE.max}
          step={0.01}
          value={settings.temperature ?? 0.7}
          onChange={handleSliderChange('temperature')}
          disabled={disabled}
          className="slider-custom h-2 w-full appearance-none rounded-full bg-white/5 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:ring-offset-2 focus:ring-offset-[#050505] disabled:opacity-50
            [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-400/40 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-emerald-400 [&::-webkit-slider-thumb]:to-emerald-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-emerald-400/20 [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:scale-95 [&::-webkit-slider-thumb]:disabled:opacity-50
            [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-400/40 [&::-moz-range-thumb]:bg-gradient-to-br [&::-moz-range-thumb]:from-emerald-400 [&::-moz-range-thumb]:to-emerald-500 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:shadow-emerald-400/20 [&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-thumb]:active:scale-95 [&::-moz-range-thumb]:disabled:opacity-50"
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
            <label className="text-xs font-medium uppercase tracking-wider text-white/70">Top P</label>
            <p className="mt-0.5 text-[11px] text-white/50">Lower = more focused</p>
          </div>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/90">
            {settings.topP?.toFixed(2) ?? '1.00'}
          </span>
        </div>
        <input
          type="range"
          min={ADVANCED_TOP_P_RANGE.min}
          max={ADVANCED_TOP_P_RANGE.max}
          step={0.01}
          value={settings.topP ?? 1}
          onChange={handleSliderChange('topP')}
          disabled={disabled}
          className="slider-custom h-2 w-full appearance-none rounded-full bg-white/5 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:ring-offset-2 focus:ring-offset-[#050505] disabled:opacity-50
            [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-400/40 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-emerald-400 [&::-webkit-slider-thumb]:to-emerald-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-emerald-400/20 [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:scale-95 [&::-webkit-slider-thumb]:disabled:opacity-50
            [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-400/40 [&::-moz-range-thumb]:bg-gradient-to-br [&::-moz-range-thumb]:from-emerald-400 [&::-moz-range-thumb]:to-emerald-500 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:shadow-emerald-400/20 [&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-thumb]:active:scale-95 [&::-moz-range-thumb]:disabled:opacity-50"
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
            <label className="text-xs font-medium uppercase tracking-wider text-white/70">Max Output Tokens</label>
            <p className="mt-0.5 text-[11px] text-white/50">Leave blank for default</p>
          </div>
        </div>
        <input
          type="number"
          min={ADVANCED_MAX_TOKENS_RANGE.min}
          max={ADVANCED_MAX_TOKENS_RANGE.max}
          value={settings.maxOutputTokens ?? ''}
          onChange={handleNumberChange('maxOutputTokens')}
          disabled={disabled}
          placeholder="1024"
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none disabled:opacity-50"
        />
      </div>
    </div>
  );
}
