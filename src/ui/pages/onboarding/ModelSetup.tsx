import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader, Info, Settings } from "lucide-react";
import { readSettings, addOrUpdateModel } from "../../../core/storage/repo";
import { localStorage_ } from "../../../core/storage/localstorage";
import type { ProviderCredential, Model } from "../../../core/storage/schemas";

export function ModelSetupPage() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderCredential | null>(null);
  const [modelName, setModelName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const settings = await readSettings();
      setProviders(settings.providerCredentials);
      
      if (settings.providerCredentials.length > 0) {
        const firstProvider = settings.providerCredentials[0];
        setSelectedProvider(firstProvider);
        
        const defaultModel = getDefaultModelName(firstProvider.providerId);
        setModelName(defaultModel);
        setDisplayName(defaultModel);
      }
    } catch (error) {
      console.error("Failed to load providers:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveModel = async () => {
    if (!selectedProvider || !modelName.trim() || !displayName.trim()) return;

    setIsSaving(true);
    try {
      const model: Omit<Model, 'id'> = {
        name: modelName.trim(),
        providerId: selectedProvider.id,
        displayName: displayName.trim(),
        createdAt: Date.now()
      };

      await addOrUpdateModel(model);
      
      localStorage_.setOnboardingCompleted(true);
      localStorage_.setModelSetupCompleted(true);
      
      navigate("/chat?firstTime=true");
    } catch (error: any) {
      console.error("Failed to save model:", error);
      // TODO: Show error to user
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    localStorage_.setOnboardingCompleted(true);
    navigate("/chat");
  };

  const canSave = selectedProvider && modelName.trim().length > 0 && displayName.trim().length > 0;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="flex items-center space-x-3 text-gray-600">
          <Loader size={24} className="animate-spin" />
          <span>Loading providers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/onboarding/provider")}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Model Setup</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Step 2 of 2</p>
          </div>
          <div className="w-10"></div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mb-4">
              <Settings size={24} className="text-gray-500 dark:text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Providers Found</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              No providers configured. Please add a provider first.
            </p>
            <button
              onClick={() => navigate("/onboarding/provider")}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Add Provider
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Provider Selection */}
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Select Provider
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Choose which provider to use for this model
                </p>
              </div>
              
              <div className="space-y-3">
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      selectedProvider?.id === provider.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                    onClick={() => {
                      setSelectedProvider(provider);
                      const defaultModel = getDefaultModelName(provider.providerId);
                      setModelName(defaultModel);
                      setDisplayName(defaultModel);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {provider.label}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {getProviderDisplayName(provider.providerId)}
                        </p>
                      </div>
                      {selectedProvider?.id === provider.id && (
                        <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Model Configuration */}
            {selectedProvider && (
              <div className="space-y-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Configure Model
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Set up the AI model you want to use
                  </p>
                </div>

                {/* Model Name */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-900 dark:text-white">
                    Model Name
                  </label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g., gpt-4, claude-3-sonnet"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    The exact model identifier for API calls
                  </p>
                </div>

                {/* Display Name */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-900 dark:text-white">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g., GPT-4, Claude 3 Sonnet"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Friendly name shown in the UI
                  </p>
                </div>

                {/* Popular Models Info */}
                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <Info size={20} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
                        Popular {getProviderDisplayName(selectedProvider.providerId)} Models:
                      </h4>
                      <div className="space-y-1 text-sm text-blue-800 dark:text-blue-300">
                        {getPopularModels(selectedProvider.providerId).map((model, index) => (
                          <div key={index}>• {model}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {selectedProvider && (
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 space-y-3">
          <button
            onClick={handleSaveModel}
            disabled={!canSave || isSaving}
            className={`w-full px-6 py-3 rounded-lg font-medium transition-all flex items-center justify-center space-x-2 ${
              canSave && !isSaving
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                : "bg-gray-400 text-white cursor-not-allowed"
            }`}
          >
            {isSaving ? (
              <>
                <Loader size={20} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span>Complete Setup</span>
                <ArrowRight size={20} />
              </>
            )}
          </button>

          <button
            onClick={handleSkip}
            className="w-full px-6 py-3 rounded-lg font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            Skip Model Setup
          </button>
        </div>
      )}
    </div>
  );
}

function getDefaultModelName(providerId: string): string {
  switch (providerId) {
    case "openai":
      return "gpt-4";
    case "anthropic":
      return "claude-3-sonnet-20240229";
    case "openrouter":
      return "openai/gpt-4";
    default:
      return "gpt-3.5-turbo";
  }
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
      return "OpenAI-Compatible";
    case "custom-json":
      return "Custom";
    default:
      return "Provider";
  }
}

function getPopularModels(providerId: string): string[] {
  switch (providerId) {
    case "openai":
      return ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"];
    case "anthropic":
      return ["claude-3-sonnet-20240229", "claude-3-haiku-20240307", "claude-3-opus-20240229"];
    case "openrouter":
      return ["openai/gpt-4", "anthropic/claude-3-sonnet", "meta-llama/llama-2-70b-chat"];
    default:
      return ["gpt-3.5-turbo", "gpt-4"];
  }
}
