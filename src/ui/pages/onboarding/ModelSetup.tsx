import { ArrowLeft, Check, Loader, Settings, HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useModelController } from "./hooks/useModelController";

export function ModelSetupPage() {
  const navigate = useNavigate();
  const {
    state: {
      providers,
      selectedProvider,
      modelName,
      displayName,
      isLoading,
      isSaving,
      verificationError,
    },
    canSave,
    handleProviderSelect,
    handleModelNameChange,
    handleDisplayNameChange,
    handleSaveModel,
    handleSkip,
    goToProviderSetup,
  } = useModelController();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center rounded-3xl border border-white/5 bg-black/40 text-gray-300">
        <div className="flex items-center gap-3 text-sm">
          <Loader size={20} className="animate-spin" />
          Loading providers...
        </div>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 rounded-3xl border border-white/5 bg-black/40 text-center text-gray-300">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/10 text-gray-200">
          <Settings size={26} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white">No providers configured</h2>
          <p className="max-w-md text-sm text-gray-400">
            You'll need to connect a provider before choosing a default model.
          </p>
        </div>
        <button
          onClick={goToProviderSetup}
          className="rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/20"
        >
          Go to provider setup
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col text-gray-200 px-4 pt-8 pb-16 overflow-y-auto">
      <div className="flex flex-col items-center">
        {/* Header */}
        <div className="flex w-full max-w-sm items-center justify-between mb-8">
          <button
            onClick={goToProviderSetup}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white transition-all duration-200 hover:border-white/30 hover:bg-white/15 active:scale-[0.98]"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-gray-500">Step 2 of 3</p>
            <p className="text-xs text-gray-400 mt-0.5">Model Setup</p>
          </div>
          <div className="w-10" /> {/* Spacer */}
        </div>

        {/* Title */}
        <div className="text-center space-y-2 mb-6">
          <h1 className="text-2xl font-bold text-white">Set your default model</h1>
          <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
            Choose which provider and model name LettuceAI should use by default. You'll be able to add more later.
          </p>
          <button
            onClick={() => navigate("/onboarding/model-recommendations")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-3 py-1.5 text-xs font-medium text-indigo-300 transition hover:border-indigo-400/50 hover:bg-indigo-400/20 active:scale-95"
          >
            <HelpCircle size={14} />
            Which model should I use?
          </button>
        </div>

        {/* Provider Selection */}
        <div className="w-full max-w-sm space-y-3 mb-8">
          {providers.map((provider) => {
            const isActive = selectedProvider?.id === provider.id;
            return (
              <button
                key={provider.id}
                className={`w-full min-h-[60px] rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${isActive
                  ? "border-white/25 bg-white/15 shadow-lg"
                  : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 active:scale-[0.98]"
                  }`}
                onClick={() => handleProviderSelect(provider)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/8">
                    <Settings size={16} className="text-gray-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white">{provider.label}</h3>
                    <p className="text-xs text-gray-400 truncate">{getProviderDisplayName(provider.providerId)}</p>
                  </div>
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${isActive
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

        {/* Model Configuration */}
        <div className={`w-full max-w-sm space-y-6 transition-all duration-300 ${selectedProvider ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold text-white">Model Details</h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              Define the API identifier and the label you'll see inside the app.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70">Model Name</label>
              <input
                type="text"
                value={modelName}
                onChange={(e) => handleModelNameChange(e.target.value)}
                placeholder="gpt-4o, claude-3-sonnet"
                className="w-full min-h-[44px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
              />
              <p className="text-xs text-gray-500">Exact identifier used for API calls</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                placeholder="Creative mentor"
                className="w-full min-h-[44px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
              />
              <p className="text-xs text-gray-500">How this model appears in menus</p>
            </div>
          </div>

          {verificationError && (
            <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3">
              <p className="text-sm text-red-200">{verificationError}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleSaveModel}
              disabled={!canSave || isSaving}
              className="w-full min-h-[48px] rounded-2xl border border-emerald-400/40 bg-emerald-400/20 px-6 py-4 font-semibold text-emerald-100 transition-all duration-200 hover:border-emerald-300/80 hover:bg-emerald-400/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-emerald-400/10 disabled:bg-emerald-400/5 disabled:text-emerald-400"
            >
              {isSaving ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader size={16} className="animate-spin" />
                  Verifying...
                </div>
              ) : (
                "Next: Memory System"
              )}
            </button>

            <button
              onClick={handleSkip}
              className="w-full min-h-[44px] rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-gray-400 transition-all duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-[0.98]"
            >
              Skip for now
            </button>
          </div>

          {!canSave && (
            <p className="text-xs text-center text-gray-500">
              Fill out both fields above to enable the finish button.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function getProviderDisplayName(providerId: string): string {
  switch (providerId) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "openrouter":
      return "OpenRouter";
    case "openai-compatible":
      return "OpenAI compatible";
    case "custom":
      return "Custom endpoint";
    default:
      return providerId;
  }
}
