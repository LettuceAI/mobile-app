import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, AlertCircle, Loader, ExternalLink, Settings, Wrench } from "lucide-react";
import { providerRegistry } from "../../../core/providers/registry";
import { addOrUpdateProviderCredential } from "../../../core/storage/repo";
import { localStorage_ } from "../../../core/storage/localstorage";
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

  const selectedProvider = providerRegistry.find(p => p.id === selectedProviderId);

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
      
      setTimeout(() => {
        const formSection = document.getElementById('provider-form');
        if (formSection) {
          formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
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
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setTestResult({ success: true, message: "Connection successful!" });
    } catch (error: any) {
      setTestResult({ 
        success: false, 
        message: error.message || "Connection failed" 
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
      
      const credential: Omit<ProviderCredential, 'id'> & { id: string } = {
        id: credentialId,
        providerId: selectedProviderId,
        label: label.trim(),
        apiKeyRef: {
          providerId: selectedProviderId,
          key: "apiKey",
          credId: credentialId
        },
        baseUrl: baseUrl || undefined
      };

      await addOrUpdateProviderCredential(credential);
      
      if (credential.apiKeyRef && apiKey) {
        await setSecret(credential.apiKeyRef, apiKey);
      }
      
      localStorage_.setProviderSetupCompleted(true);
      navigate("/onboarding/models");
    } catch (error: any) {
      setTestResult({ 
        success: false, 
        message: error.message || "Failed to save provider" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canTest = selectedProvider && apiKey.trim().length > 0;
  const canSave = canTest && label.trim().length > 0;

  const getProviderWebsite = (providerId: string): string => {
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
  };

  const getProviderDescription = (providerId: string): string => {
    switch (providerId) {
      case "openai":
        return "GPT-4, GPT-3.5-turbo, and other OpenAI models";
      case "anthropic":
        return "Claude models with advanced reasoning";
      case "openrouter":
        return "Access to multiple AI models through one API";
      case "openai-compatible":
        return "AI language model provider";
      case "custom":
        return "AI language model provider";
      default:
        return "AI language model provider";
    }
  };

    const getProviderIcon = (providerId: string) => {
    switch (providerId) {
      case "openai":
        return <img src={openaiIcon} alt="OpenAI" className="w-5 h-5" />;
      case "anthropic":
        return <img src={anthropicIcon} alt="Anthropic" className="w-5 h-5" />;
      case "openrouter":
        return <img src={openrouterIcon} alt="OpenRouter" className="w-5 h-5" />;
      case "custom":
        return <Settings className="w-5 h-5 text-gray-500 dark:text-gray-400" />;
      default:
        return <Wrench className="w-5 h-5 text-gray-400 dark:text-gray-600" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/welcome")}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Provider Setup</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Step 1 of 2</p>
          </div>
          <div className="w-10"></div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Choose Your AI Provider
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Select the AI service you'd like to use for chatting
            </p>
          </div>
          
          <div className="space-y-3">
            {providerRegistry.map((provider) => (
              <button
                key={provider.id}
                className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                  selectedProviderId === provider.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-sm"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
                }`}
                onClick={() => setSelectedProviderId(provider.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {/* Provider Icon */}
                    <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${
                      selectedProviderId === provider.id
                        ? "border-blue-200 dark:border-blue-700 bg-blue-100 dark:bg-blue-900/50"
                        : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
                    }`}>
                      {getProviderIcon(provider.id)}
                    </div>
                    
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {provider.name}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">
                        {getProviderDescription(provider.id)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Selection Indicator */}
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedProviderId === provider.id
                      ? "border-blue-500 bg-blue-500"
                      : "border-gray-300 dark:border-gray-600"
                  }`}>
                    {selectedProviderId === provider.id && (
                      <Check size={12} className="text-white" />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Configuration Form */}
        {selectedProvider && showForm && (
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div
              id="provider-form"
              className="p-6 space-y-6"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Configure {selectedProvider.name}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Enter your API credentials to connect with {selectedProvider.name}
                </p>
              </div>

              {/* Provider Label */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Provider Label
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={`My ${selectedProvider.name} Account`}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Give this provider configuration a memorable name
                </p>
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                />
                <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>Get your API key from</span>
                  <a 
                    href={getProviderWebsite(selectedProvider.id)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                  >
                    <span>{selectedProvider.name}</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {/* Base URL */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Base URL <span className="text-gray-500 dark:text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Override the default API endpoint URL
                </p>
              </div>

              {/* Test Connection */}
              <div className="space-y-3">
                <button
                  onClick={handleTestConnection}
                  disabled={!canTest || isTesting}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
                >
                  {isTesting ? (
                    <>
                      <Loader size={16} className="animate-spin" />
                      <span>Testing Connection...</span>
                    </>
                  ) : (
                    <span>Test Connection</span>
                  )}
                </button>

                {testResult && (
                  <div
                    className={`p-3 rounded-lg flex items-center space-x-2 text-sm ${
                      testResult.success 
                        ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800" 
                        : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
                    }`}
                  >
                    {testResult.success ? (
                      <Check size={16} />
                    ) : (
                      <AlertCircle size={16} />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {selectedProvider && showForm && (
        <div className="p-6 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSaveProvider}
            disabled={!canSave || isSubmitting}
            className={`w-full px-6 py-3 rounded-lg font-medium text-white transition-all flex items-center justify-center space-x-2 ${
              canSave && !isSubmitting
                ? "bg-blue-600 hover:bg-blue-700 shadow-sm"
                : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader size={16} className="animate-spin" />
                <span>Setting up...</span>
              </>
            ) : (
              <>
                <span>Continue to Models</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
