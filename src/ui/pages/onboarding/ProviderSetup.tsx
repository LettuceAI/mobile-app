import React from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Loader,
} from "lucide-react";

import { getProviderCapabilities, toCamel, type ProviderCapabilitiesCamel } from "../../../core/providers/capabilities";
import { useProviderController } from "./hooks/useProviderController";
import { getProviderIcon } from "../../../core/utils/providerIcons";

interface ProviderCardProps {
  provider: ProviderCapabilitiesCamel;
  isActive: boolean;
  onClick: () => void;
}

function ProviderCard({ provider, isActive, onClick }: ProviderCardProps) {
  return (
    <button
      className={`relative group min-h-[88px] rounded-2xl border px-3 py-3 text-left transition-all duration-200 ${isActive
          ? "border-white/25 bg-white/15 shadow-lg"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 active:scale-[0.98]"
        }`}
      onClick={onClick}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/8">
            {getProviderIcon(provider.id)}
          </div>
          <div className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${isActive
              ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-300"
              : "border-white/20 text-transparent"
            }`}>
            <Check size={10} />
          </div>
        </div>
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-white leading-tight">{provider.name}</h3>
          <p className="text-[11px] text-gray-400 leading-snug line-clamp-2">{getProviderDescription(provider.id)}</p>
        </div>
      </div>
    </button>
  );
}

export function ProviderSetupPage() {
  const {
    state: {
      selectedProviderId,
      label,
      apiKey,
      baseUrl,
      isTesting,
      testResult,
      isSubmitting,
      showForm,
    },
    canTest,
    canSave,
    handleSelectProvider,
    handleLabelChange,
    handleApiKeyChange,
    handleBaseUrlChange,
    handleTestConnection,
    handleSaveProvider,
    goToWelcome,
  } = useProviderController();

  const [capabilities, setCapabilities] = React.useState<ProviderCapabilitiesCamel[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const caps = (await getProviderCapabilities()).map(toCamel);
        if (!cancelled) setCapabilities(caps);
      } catch (e) {
        console.warn("[Onboarding] Failed to load provider capabilities", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedProvider = capabilities.find((p) => p.id === selectedProviderId);

  return (
    <div className="flex min-h-screen flex-col text-gray-200 px-4 pt-8 overflow-y-auto">
      <div className="flex flex-col items-center pb-8">
        {/* Header */}
        <div className="flex w-full max-w-sm items-center justify-between mb-8">
          <button
            onClick={goToWelcome}
            className="flex items-center justify-center rounded-full border border-white/15 bg-white/8 text-white transition-all duration-200 hover:border-white/30 hover:bg-white/15 active:scale-[0.98]"
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
            Select an AI provider to get started. Your API keys are securely encrypted on your device. No account signup needed.
          </p>
        </div>

        {/* Provider Selection */}
        <div className="w-full max-w-2xl mb-8">
          <div className="grid grid-cols-2 gap-3">
            {capabilities.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isActive={selectedProviderId === provider.id}
                onClick={() => handleSelectProvider({ id: provider.id, name: provider.name, defaultBaseUrl: provider.defaultBaseUrl })}
              />
            ))}
          </div>
        </div>

        {/* Configuration Form */}

        <div
          className={`config-form-section w-full max-w-sm transition-all duration-300 ${showForm ? "opacity-100 max-h-[2000px]" : "opacity-0 max-h-0 overflow-hidden pointer-events-none"}`}>
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
                onChange={(e) => handleLabelChange(e.target.value)}
                onPaste={(e) => {
                  e.stopPropagation();
                  const pastedText = e.clipboardData.getData("text");
                  handleLabelChange(pastedText);
                }}
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
                type="text"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
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
                onChange={(e) => handleBaseUrlChange(e.target.value)}
                onPaste={(e) => {
                  e.stopPropagation();
                  const pastedText = e.clipboardData.getData("text");
                  handleBaseUrlChange(pastedText);
                }}
                placeholder="https://api.provider.com"
                className="w-full min-h-[44px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
              />
              <p className="text-xs text-gray-500">Override the default endpoint if needed</p>
            </div>
          </div>

          {testResult && (
            <div className={`rounded-2xl border my-2 px-4 py-3 text-sm ${testResult.success
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
              {isSubmitting ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader size={16} className="animate-spin" />
                  Verifying...
                </div>
              ) : (
                "Continue"
              )}
            </button>
          </div>
        </div>
      </div>
      <div id="provider-config-form"></div> { /* scroll target */}
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
      return "GPT-5, GPT-4.1, and GPT-4o models for expressive RP";
    case "anthropic":
      return "Claude 4.5 Sonnet & Haiku for deep, emotional dialogue";
    case "nanogpt":
    case "featherless":
    case "openrouter":
      return "Access models like GPT-5, Claude 4.5, Grok-3, Mixtral, and more";
    case "openai-compatible":
      return "Use any OpenAI-style API endpoint";
    case "mistral":
      return "Mistral Small 3.2, Mixtral 8x22B, and other Mistral models";
    case "deepseek":
      return "DeepSeek-V3.2-Exp, DeepSeek-R1, and other high-efficiency models";
    case "xai":
      return "Grok-1.5, Grok-3, and newer xAI models";
    case "zai":
      return "GLM-4.5, GLM-4.6, and Air variants";
    case "moonshot":
      return "Kimi-K2 Thinking and Kimi-K1 models";
    case "gemini":
      return "Gemini 2.5 Flash, 2.5 Pro, and more";
    case "qwen":
      return "Qwen3-VL and newer Qwen models";
    case "custom":
      return "Point LettuceAI to any custom model endpoint";
    default:
      return "AI model provider";
  }
}