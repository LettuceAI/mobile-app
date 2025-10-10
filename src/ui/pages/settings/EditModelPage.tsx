import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Save, Loader2, Trash2, Check, SlidersHorizontal } from "lucide-react";
import { motion } from "framer-motion";

import {
  readSettings,
  addOrUpdateModel,
  removeModel,
  setDefaultModel,
} from "../../../core/storage/repo";
import type { Model, ProviderCredential } from "../../../core/storage/schemas";
import { providerRegistry } from "../../../core/providers/registry";
import { invoke } from "@tauri-apps/api/core";
import { formatAdvancedModelSettingsSummary, sanitizeAdvancedModelSettings } from "../../components/AdvancedModelSettingsForm";
import { createDefaultAdvancedModelSettings } from "../../../core/storage/schemas";
import {
  ADVANCED_TEMPERATURE_RANGE,
  ADVANCED_TOP_P_RANGE,
  ADVANCED_MAX_TOKENS_RANGE,
} from "../../components/AdvancedModelSettingsForm";

export function EditModelPage() {
  const navigate = useNavigate();
  const { modelId } = useParams<{ modelId: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [editorModel, setEditorModel] = useState<Model | null>(null);
  const [globalAdvanced, setGlobalAdvanced] = useState(createDefaultAdvancedModelSettings());
  const [modelAdvancedDraft, setModelAdvancedDraft] = useState(createDefaultAdvancedModelSettings());
  const [overrideEnabled, setOverrideEnabled] = useState(false);

  const isNew = !modelId || modelId === "new";

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const settings = await readSettings();
        setProviders(settings.providerCredentials);
        setDefaultModelId(settings.defaultModelId);
        setGlobalAdvanced(settings.advancedModelSettings ?? createDefaultAdvancedModelSettings());

        if (isNew) {
          const firstProvider = settings.providerCredentials[0];
          const firstRegistry = providerRegistry[0];
          const newModel: Model = {
            id: crypto.randomUUID(),
            name: "",
            displayName: "",
            providerId: firstProvider?.providerId || firstRegistry?.id || "",
            providerLabel: firstProvider?.label || firstRegistry?.name || "",
            createdAt: Date.now(),
          } as Model;
          setEditorModel(newModel);
          setOverrideEnabled(false);
          setModelAdvancedDraft(sanitizeAdvancedModelSettings(settings.advancedModelSettings ?? createDefaultAdvancedModelSettings()));
        } else {
          const existing = settings.models.find((m) => m.id === modelId);
          if (!existing) {
            navigate("/settings/models");
            return;
          }
          setEditorModel(existing);
          const adv = existing.advancedModelSettings ?? null;
          if (adv) {
            setOverrideEnabled(true);
            setModelAdvancedDraft(sanitizeAdvancedModelSettings(adv));
          } else {
            setOverrideEnabled(false);
            setModelAdvancedDraft(sanitizeAdvancedModelSettings(settings.advancedModelSettings ?? createDefaultAdvancedModelSettings()));
          }
        }
      } catch (e) {
        console.error("Failed to load model settings", e);
        setError("Failed to load model settings");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [modelId, isNew]);

  // Ensure selected provider exists; if not, pick first available
  useEffect(() => {
    if (!editorModel || providers.length === 0) return;
    const hasMatch = providers.some(
      (p) => p.providerId === editorModel.providerId && p.label === editorModel.providerLabel
    );
    if (!hasMatch) {
      const fallback = providers[0];
      setEditorModel({
        ...editorModel,
        providerId: fallback.providerId,
        providerLabel: fallback.label,
      });
    }
  }, [providers, editorModel?.providerId, editorModel?.providerLabel]);

  const providerDisplay = useMemo(() => {
    return (prov: ProviderCredential) => {
      const reg = providerRegistry.find((p) => p.id === prov.providerId);
      return `${prov.label} (${reg?.name || prov.providerId})`;
    };
  }, []);

  const canSave = useMemo(() => {
    if (!editorModel) return false;
    const hasProvider = providers.find(
      (p) => p.providerId === editorModel.providerId && p.label === editorModel.providerLabel
    ) || providers.find((p) => p.providerId === editorModel.providerId);
    return !!editorModel.displayName?.trim() && !!editorModel.name?.trim() && !!hasProvider && !saving && !verifying;
  }, [editorModel, providers, saving, verifying]);

  const handleSave = async () => {
    if (!editorModel) return;
    setError(null);

    const providerCred =
      providers.find(
        (p) => p.providerId === editorModel.providerId && p.label === editorModel.providerLabel
      ) || providers.find((p) => p.providerId === editorModel.providerId);

    if (!providerCred) {
      setError("Select a provider with valid credentials");
      return;
    }

    const shouldVerify = ["openai", "anthropic"].includes(providerCred.providerId);
    if (shouldVerify) {
      try {
        setVerifying(true);
        const name = editorModel.name.trim();
        if (!name) {
          setError("Model name required");
          return;
        }
        let resp: { exists: boolean; error?: string } | undefined;
        try {
          resp = await invoke<{ exists: boolean; error?: string }>("verify_model_exists", {
            providerId: providerCred.providerId,
            credentialId: providerCred.id,
            model: name,
          });
        } catch (err) {
          console.warn("Invoke verify_model_exists failed, treating as undefined:", err);
        }
        if (!resp) {
          setError("Model verification unavailable (backend)");
          return;
        }
        if (!resp.exists) {
          setError(resp.error || "Model not found on provider");
          return;
        }
      } catch (e: any) {
        setError(e?.message || "Verification failed");
        return;
      } finally {
        setVerifying(false);
      }
    }

    setSaving(true);
    try {
      await addOrUpdateModel({
        ...editorModel,
        providerId: providerCred.providerId,
        providerLabel: providerCred.label,
        advancedModelSettings: overrideEnabled ? sanitizeAdvancedModelSettings(modelAdvancedDraft) : undefined,
      });
      navigate("/settings/models");
    } catch (e: any) {
      console.error("Failed to save model", e);
      setError(e?.message || "Failed to save model");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editorModel || isNew) return;
    try {
      setDeleting(true);
      await removeModel(editorModel.id);
      navigate("/settings/models");
    } catch (e: any) {
      console.error("Failed to delete model", e);
      setError(e?.message || "Failed to delete model");
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async () => {
    if (!editorModel) return;
    try {
      await setDefaultModel(editorModel.id);
      setDefaultModelId(editorModel.id);
    } catch (e) {
      console.error("Failed to set default model", e);
    }
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
              onChange={(e) => setEditorModel({ ...editorModel, displayName: e.target.value })}
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
              onChange={(e) => setEditorModel({ ...editorModel, name: e.target.value })}
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
                  setEditorModel({
                    ...editorModel,
                    providerId,
                    providerLabel: selectedProvider?.label ?? providerLabel,
                  });
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

          {!isNew && (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#0b0c12]/90 p-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-white">Default Model</label>
                <p className="mt-1 text-xs text-gray-400">Use this model by default</p>
              </div>
              <button
                onClick={handleSetDefault}
                disabled={defaultModelId === editorModel.id}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${defaultModelId === editorModel.id
                    ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100"
                    : "border border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
                  }`}
              >
                <Check className="h-4 w-4" />
                {defaultModelId === editorModel.id ? "Default" : "Set as Default"}
              </button>
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

                <button
                  type="button"
                  onClick={() => setOverrideEnabled(!overrideEnabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition ${
                    overrideEnabled ? "bg-emerald-400/70" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                      overrideEnabled ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                  <span className="sr-only">Toggle override</span>
                </button>
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
                    <label className="text-xs font-medium uppercase tracking-wider text-white/70">Temperature</label>
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/90">
                      {modelAdvancedDraft.temperature?.toFixed(2) ?? '0.70'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={ADVANCED_TEMPERATURE_RANGE.min}
                    max={ADVANCED_TEMPERATURE_RANGE.max}
                    step={0.01}
                    value={modelAdvancedDraft.temperature ?? 0.7}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setModelAdvancedDraft({ ...modelAdvancedDraft, temperature: Number(next.toFixed(2)) });
                    }}
                    className="slider-custom h-2 w-full appearance-none rounded-full bg-white/5 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:ring-offset-2 focus:ring-offset-[#050505]
                      [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-400/40 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-emerald-400 [&::-webkit-slider-thumb]:to-emerald-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-emerald-400/20 [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:scale-95
                      [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-400/40 [&::-moz-range-thumb]:bg-gradient-to-br [&::-moz-range-thumb]:from-emerald-400 [&::-moz-range-thumb]:to-emerald-500 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:shadow-emerald-400/20 [&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-thumb]:active:scale-95"
                  />
                  <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
                    <span>{ADVANCED_TEMPERATURE_RANGE.min}</span>
                    <span>{ADVANCED_TEMPERATURE_RANGE.max}</span>
                  </div>
                </div>

                {/* Top P */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-medium uppercase tracking-wider text-white/70">Top P</label>
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/90">
                      {modelAdvancedDraft.topP?.toFixed(2) ?? '1.00'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={ADVANCED_TOP_P_RANGE.min}
                    max={ADVANCED_TOP_P_RANGE.max}
                    step={0.01}
                    value={modelAdvancedDraft.topP ?? 1}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setModelAdvancedDraft({ ...modelAdvancedDraft, topP: Number(next.toFixed(2)) });
                    }}
                    className="slider-custom h-2 w-full appearance-none rounded-full bg-white/5 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:ring-offset-2 focus:ring-offset-[#050505]
                      [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-400/40 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-emerald-400 [&::-webkit-slider-thumb]:to-emerald-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-emerald-400/20 [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:scale-95
                      [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-400/40 [&::-moz-range-thumb]:bg-gradient-to-br [&::-moz-range-thumb]:from-emerald-400 [&::-moz-range-thumb]:to-emerald-500 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:shadow-emerald-400/20 [&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-thumb]:active:scale-95"
                  />
                  <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
                    <span>{ADVANCED_TOP_P_RANGE.min}</span>
                    <span>{ADVANCED_TOP_P_RANGE.max}</span>
                  </div>
                </div>

                {/* Max Tokens */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-medium text-white/70">MAX TOKENS</label>
                    <button
                      type="button"
                      onClick={() => setModelAdvancedDraft({ ...modelAdvancedDraft, maxOutputTokens: null })}
                      className="text-xs text-emerald-400 transition hover:text-emerald-300"
                    >
                      Clear
                    </button>
                  </div>
                  <input
                    type="number"
                    step={128}
                    min={ADVANCED_MAX_TOKENS_RANGE.min}
                    max={ADVANCED_MAX_TOKENS_RANGE.max}
                    value={modelAdvancedDraft.maxOutputTokens ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const next = raw === "" ? null : Math.round(Number(raw));
                      setModelAdvancedDraft({ ...modelAdvancedDraft, maxOutputTokens: next });
                    }}
                    placeholder="1024"
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-emerald-400/50 focus:outline-none"
                  />
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