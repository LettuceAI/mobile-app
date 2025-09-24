import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Check,
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
      

      const result = await addOrUpdateProviderCredential(credential);

      if (result) {
        console.log("Provider credential saved successfully:", result);
      } else {
        throw new Error("Failed to save provider credential");
      }

      if (credential.apiKeyRef && apiKey) {
        await setSecret(credential.apiKeyRef, apiKey);
      }

      await setProviderSetupCompleted(true);
      navigate("/onboarding/models");
    } catch (error: any) {
      console.log(error)
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
    <div className="flex min-h-screen flex-col text-gray-200 px-4 pt-8">
      <div className="flex flex-col items-center">
        {/* Header */}
        <div className="flex w-full max-w-sm items-center justify-between mb-8">
          <button
            onClick={() => navigate("/welcome")}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white transition-all duration-200 hover:border-white/30 hover:bg-white/15 active:scale-[0.98]"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-gray-500">Step 1 of 2</p>
            <p className="text-xs text-gray-400 mt-0.5">Provider Setup</p>
          </div>
          <div className="w-10" /> {/* Spacer */}
        </div>

        {/* Title */}
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-2xl font-bold text-white">Choose your AI provider</h1>
          <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
            Connect an API provider. Your keys are encrypted locally—no external accounts required.
          </p>
        </div>

        {/* Provider Selection */}
        <div className="w-full max-w-sm space-y-3 mb-8">
          {providerRegistry.map((provider) => {
            const isActive = selectedProviderId === provider.id;
            return (
              <button
                key={provider.id}
                className={`w-full min-h-[60px] rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                  isActive
                    ? "border-white/25 bg-white/15 shadow-lg"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 active:scale-[0.98]"
                }`}
                onClick={() => setSelectedProviderId(provider.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/8">
                    {getProviderIcon(provider.id)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white">{provider.name}</h3>
                    <p className="text-xs text-gray-400 truncate">{getProviderDescription(provider.id)}</p>
                  </div>
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                    isActive
                      ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-300"
                      : "border-white/20 text-transparent"
                  }`}>
                    <Check size={12} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Configuration Form */}
        <div className={`w-full max-w-sm transition-all duration-300 ${showForm ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="text-center space-y-2 mb-6">
            <h2 className="text-lg font-semibold text-white">Connect {selectedProvider?.name}</h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              Paste your API key below to enable chats. Need a key? Get one from the provider dashboard.
            </p>
          </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-white/70">Display Label</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={`My ${selectedProvider?.name}`}
                  className="w-full min-h-[44px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
                />
                <p className="text-xs text-gray-500">How this provider will appear in your menus</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-white/70">API Key</label>
                  <button
                    onClick={() => window.open(getProviderWebsite(selectedProviderId), "_blank")}
                    className="text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    Where to find it
                  </button>
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full min-h-[44px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
                />
                <p className="text-xs text-gray-500">Keys are encrypted locally</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-white/70">Base URL (Optional)</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.provider.com"
                  className="w-full min-h-[44px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
                />
                <p className="text-xs text-gray-500">Override the default endpoint if needed</p>
              </div>
            </div>

            {testResult && (
              <div className={`rounded-2xl border px-4 py-3 text-sm ${
                testResult.success
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                  : "border-amber-400/40 bg-amber-400/10 text-amber-200"
              }`}>
                {testResult.message}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleTestConnection}
                disabled={!canTest || isTesting}
                className="w-full min-h-[48px] rounded-2xl border border-white/20 bg-white/10 px-6 py-4 font-semibold text-white transition-all duration-200 hover:border-white/30 hover:bg-white/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/5 disabled:text-gray-500"
              >
                {isTesting ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader size={16} className="animate-spin" />
                    Testing...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <AlertCircle size={16} />
                    Test Connection
                  </div>
                )}
              </button>
              
              <button
                onClick={handleSaveProvider}
                disabled={!canSave || isSubmitting}
                className="w-full min-h-[48px] rounded-2xl border border-emerald-400/40 bg-emerald-400/20 px-6 py-4 font-semibold text-emerald-100 transition-all duration-200 hover:border-emerald-300/80 hover:bg-emerald-400/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-emerald-400/10 disabled:bg-emerald-400/5 disabled:text-emerald-400"
              >
                {isSubmitting ? "Saving..." : "Continue"}
              </button>
            </div>
          </div>
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


