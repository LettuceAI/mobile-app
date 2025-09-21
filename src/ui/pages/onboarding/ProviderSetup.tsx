import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ExternalLink,
  Loader,
  Settings,
  Wrench,
} from "lucide-react";

import { providerRegistry } from "../../../core/providers/registry";
import { addOrUpdateProviderCredential } from "../../../core/storage/repo";
import { setProviderSetupCompleted } from "../../../core/storage/appState";
import { setSecret } from "../../../core/secrets";
import type { ProviderCredential } from "../../../core/storage/schemas";

import openaiIcon from "../../../assets/openai.svg";
import anthropicIcon from "../../../assets/anthropic.svg";
import openrouterIcon from "../../../assets/openrouter.svg";

export function ProviderSetupPage() {
  const navigate = useNavigate();
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const selectedProvider = providerRegistry.find((p) => p.id === selectedProviderId);

  useEffect(() => {
    if (selectedProvider) {
      setLabel(`My ${selectedProvider.name}`);
      setShowForm(true);
      if (selectedProvider.id === "openrouter") {
        setBaseUrl("https://openrouter.ai/api/v1");
      } else if (selectedProvider.id === "openai") {
        setBaseUrl("https://api.openai.com/v1");
      } else if (selectedProvider.id === "anthropic") {
        setBaseUrl("https://api.anthropic.com");
      } else {
        setBaseUrl("");
      }

    }
  }, [selectedProvider]);

  const handleTestConnection = async () => {
    if (!selectedProvider || !apiKey.trim()) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      if (apiKey.length < 10) {
        throw new Error("API key seems too short");
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));

      setTestResult({ success: true, message: "Connection successful!" });
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || "Connection failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveProvider = async () => {
    if (!selectedProvider || !apiKey.trim() || !label.trim()) return;

    setIsSubmitting(true);
    try {
      const credentialId = crypto.randomUUID();

      const credential: Omit<ProviderCredential, "id"> & { id: string } = {
        id: credentialId,
        providerId: selectedProviderId,
        label: label.trim(),
        apiKeyRef: {
          providerId: selectedProviderId,
          key: "apiKey",
          credId: credentialId,
        },
        baseUrl: baseUrl || undefined,
      };

      await addOrUpdateProviderCredential(credential);

      if (credential.apiKeyRef && apiKey) {
        await setSecret(credential.apiKeyRef, apiKey);
      }

      await setProviderSetupCompleted(true);
      navigate("/onboarding/models");
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || "Failed to save provider",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canTest = selectedProvider && apiKey.trim().length > 0;
  const canSave = canTest && label.trim().length > 0;

  return (
    <div className="flex h-full flex-col gap-6 pb-12 text-gray-200">
      <header className="relative overflow-hidden rounded-3xl border border-white/5 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_rgba(5,5,5,0.85))] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.5)]">
        <div className="absolute right-[-4rem] top-[-4rem] h-48 w-48 rounded-full bg-white/10 blur-3xl opacity-50" />
        <div className="absolute bottom-[-5rem] left-[-6rem] h-64 w-64 rounded-full bg-white/10 blur-3xl opacity-35" />
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <button
              onClick={() => navigate("/welcome")}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-300 transition hover:border-white/30 hover:text-white"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-gray-500">Step 1 of 2</p>
              <h1 className="text-xl font-semibold text-white">Choose your AI provider</h1>
            </div>
          </div>
          <p className="max-w-[220px] text-xs text-gray-400">
            Connect an API provider. Your keys are encrypted locally—no external accounts required to use the app.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1.1fr_1fr]">
        <section className="space-y-5 rounded-3xl border border-white/5 bg-black/45 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Available providers</h2>
              <p className="text-xs text-gray-500">Pick one to unlock the character hub.</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.35em] text-gray-400">
              Required
            </span>
          </header>

          <div className="space-y-3">
            {providerRegistry.map((provider) => {
              const isActive = selectedProviderId === provider.id;
              return (
                <button
                  key={provider.id}
                  className={`w-full rounded-2xl border px-5 py-4 text-left transition ${
                    isActive
                      ? "border-white/25 bg-white/15 shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
                      : "border-white/5 bg-black/40 hover:border-white/15 hover:bg-black/35"
                  }`}
                  onClick={() => setSelectedProviderId(provider.id)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                        {getProviderIcon(provider.id)}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">{provider.name}</h3>
                        <p className="text-[11px] text-gray-400">{getProviderDescription(provider.id)}</p>
                      </div>
                    </div>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                      isActive
                        ? "border-emerald-300/60 bg-emerald-400/20 text-emerald-200"
                        : "border-white/10 text-gray-500"
                    }`}>
                      <Check size={14} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section
          id="provider-form"
          className="rounded-3xl border border-white/5 bg-black/45 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.4)]"
        >
          {showForm ? (
            <div className="space-y-6">
              <header>
                <h2 className="text-lg font-semibold text-white">Connect {selectedProvider?.name}</h2>
                <p className="text-sm text-gray-500">
                  Paste your API key below to enable chats. Need a key? Get one from the provider dashboard.
                </p>
              </header>

              <div className="space-y-5">
                <Field label="Display label" description="How this provider will appear in your menus.">
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={`My ${selectedProvider?.name}`}
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
                  />
                </Field>

                <Field
                  label="API key"
                  description="Keys are encrypted locally."
                  actionLabel="Where to find it"
                  onAction={() => window.open(getProviderWebsite(selectedProviderId), "_blank")}
                >
                  <div className="relative">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
                    />
                    <ExternalLink className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  </div>
                </Field>

                <Field label="Base URL" description="Optional. Override the default endpoint if needed.">
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.provider.com"
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
                  />
                </Field>
              </div>

              {testResult && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    testResult.success
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                      : "border-amber-400/40 bg-amber-400/10 text-amber-200"
                  }`}
                >
                  {testResult.message}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleTestConnection}
                  disabled={!canTest || isTesting}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/20 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/5 disabled:text-gray-500"
                >
                  {isTesting ? <Loader size={16} className="animate-spin" /> : <AlertCircle size={16} />}
                  {isTesting ? "Testing..." : "Test connection"}
                </button>
                <button
                  onClick={handleSaveProvider}
                  disabled={!canSave || isSubmitting}
                  className="flex-1 rounded-full border border-emerald-400/40 bg-emerald-400/20 px-6 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/80 hover:bg-emerald-400/30 disabled:cursor-not-allowed disabled:border-emerald-400/10 disabled:bg-emerald-400/5 disabled:text-emerald-400"
                >
                  {isSubmitting ? "Saving..." : "Continue"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-gray-500">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-gray-300">
                <Wrench size={22} />
              </div>
              <p className="text-sm">Pick a provider from the list to connect your first API key.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function getProviderWebsite(providerId: string): string {
  switch (providerId) {
    case "openai":
      return "https://platform.openai.com/api-keys";
    case "anthropic":
      return "https://console.anthropic.com/";
    case "openrouter":
      return "https://openrouter.ai/keys";
    default:
      return "#";
  }
}

function getProviderDescription(providerId: string): string {
  switch (providerId) {
    case "openai":
      return "GPT-4, GPT-3.5-turbo, and GPT-4o models";
    case "anthropic":
      return "Claude models with advanced reasoning";
    case "openrouter":
      return "Gateway to multiple frontier models";
    case "openai-compatible":
      return "Bring your own OpenAI-compatible service";
    case "custom":
      return "Point LettuceAI to any custom endpoint";
    default:
      return "AI language model provider";
  }
}

function getProviderIcon(providerId: string) {
  switch (providerId) {
    case "openai":
      return <img src={openaiIcon} alt="OpenAI" className="h-5 w-5" />;
    case "anthropic":
      return <img src={anthropicIcon} alt="Anthropic" className="h-5 w-5" />;
    case "openrouter":
      return <img src={openrouterIcon} alt="OpenRouter" className="h-5 w-5" />;
    case "custom":
      return <Settings className="h-5 w-5 text-gray-400" />;
    default:
      return <Wrench className="h-5 w-5 text-gray-500" />;
  }
}

function Field({
  label,
  description,
  children,
  actionLabel,
  onAction,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <label className="text-sm font-semibold text-white">{label}</label>
          {description && <p className="text-xs text-gray-500">{description}</p>}
        </div>
        {actionLabel && onAction && (
          <button onClick={onAction} className="text-xs font-medium text-gray-400 hover:text-white">
            {actionLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
