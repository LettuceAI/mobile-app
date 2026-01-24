import { AlertCircle, Loader } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { TestResult } from "../hooks/onboardingReducer";

interface ProviderConfigFormProps {
  selectedProviderId: string;
  selectedProviderName?: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  config?: Record<string, any>;
  testResult: TestResult;
  isTesting: boolean;
  isSubmitting: boolean;
  canTest: boolean;
  canSave: boolean;
  onLabelChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onConfigChange?: (config: Record<string, any>) => void;
  onTestConnection: () => void;
  onSave: () => void;
}

export function ProviderConfigForm({
  selectedProviderId,
  selectedProviderName,
  label,
  apiKey,
  baseUrl,
  config,
  testResult,
  isTesting,
  isSubmitting,
  canTest,
  canSave,
  onLabelChange,
  onApiKeyChange,
  onBaseUrlChange,
  onConfigChange,
  onTestConnection,
  onSave,
}: ProviderConfigFormProps) {
  const navigate = useNavigate();
  const isCustomProvider = ["custom", "custom-anthropic"].includes(selectedProviderId);
  const isLocalProvider = ["ollama", "lmstudio"].includes(selectedProviderId);
  const showBaseUrl = isCustomProvider || isLocalProvider;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/70">Display Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder={`My ${selectedProviderName || "Provider"}`}
          className="w-full min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
        />
        <p className="text-[11px] text-gray-500">How this provider will appear in your menus</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-white/70">
            API Key{isLocalProvider ? " (Optional)" : ""}
          </label>
          {!isLocalProvider && !isCustomProvider && (
            <button
              onClick={() =>
                navigate(
                  `/wheretofind${selectedProviderId ? `?provider=${selectedProviderId}` : ""}`,
                )
              }
              className="text-[11px] text-gray-400 hover:text-white transition-colors"
            >
              Where to find it
            </button>
          )}
        </div>
        <input
          type="text"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder={isLocalProvider ? "Usually not required" : "sk-..."}
          className="w-full min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
        />
        <p className="text-[11px] text-gray-500">Keys are encrypted locally</p>
      </div>

      {showBaseUrl && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-white/70">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder={isLocalProvider ? "http://localhost:11434" : "https://api.provider.com"}
            className="w-full min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
          />
          <p className="text-[11px] text-gray-500">
            {isLocalProvider
              ? "Your local server address with port"
              : "Override the default endpoint if needed"}
          </p>
        </div>
      )}

      {isCustomProvider && onConfigChange && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70">Chat Endpoint</label>
              <input
                type="text"
                value={config?.chatEndpoint ?? "/v1/chat/completions"}
                onChange={(e) => onConfigChange({ ...config, chatEndpoint: e.target.value })}
                className="w-full min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70">System Role</label>
              <input
                type="text"
                value={config?.systemRole ?? "system"}
                onChange={(e) => onConfigChange({ ...config, systemRole: e.target.value })}
                className="w-full min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70">User Role</label>
              <input
                type="text"
                value={config?.userRole ?? "user"}
                onChange={(e) => onConfigChange({ ...config, userRole: e.target.value })}
                className="w-full min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70">Assistant Role</label>
              <input
                type="text"
                value={config?.assistantRole ?? "assistant"}
                onChange={(e) => onConfigChange({ ...config, assistantRole: e.target.value })}
                className="w-full min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-medium text-white/70">Supports Streaming</span>
            <div className="flex items-center">
              <input
                id="supportsStream-onboarding"
                type="checkbox"
                checked={config?.supportsStream ?? true}
                onChange={(e) => onConfigChange({ ...config, supportsStream: e.target.checked })}
                className="peer sr-only"
              />
              <label
                htmlFor="supportsStream-onboarding"
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out ${
                  (config?.supportsStream ?? true) ? "bg-emerald-500" : "bg-white/20"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    (config?.supportsStream ?? true) ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </label>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-medium text-white/70">Merge Same-role Messages</span>
            <div className="flex items-center">
              <input
                id="mergeSameRoleMessages-onboarding"
                type="checkbox"
                checked={config?.mergeSameRoleMessages ?? true}
                onChange={(e) =>
                  onConfigChange({ ...config, mergeSameRoleMessages: e.target.checked })
                }
                className="peer sr-only"
              />
              <label
                htmlFor="mergeSameRoleMessages-onboarding"
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out ${
                  (config?.mergeSameRoleMessages ?? true) ? "bg-emerald-500" : "bg-white/20"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    (config?.mergeSameRoleMessages ?? true) ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </label>
            </div>
          </div>
        </>
      )}

      {testResult && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            testResult.success
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
              : "border-amber-400/40 bg-amber-400/10 text-amber-200"
          }`}
        >
          {testResult.message}
        </div>
      )}

      <div className="space-y-2 pt-2">
        <button
          onClick={onTestConnection}
          disabled={!canTest || isTesting}
          className="w-full min-h-11 rounded-xl border border-white/20 bg-white/10 px-4 py-3 font-medium text-white transition-all duration-200 hover:border-white/30 hover:bg-white/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/5 disabled:text-gray-500"
        >
          {isTesting ? (
            <div className="flex items-center justify-center gap-2">
              <Loader size={14} className="animate-spin" />
              Testing...
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <AlertCircle size={14} />
              Test Connection
            </div>
          )}
        </button>

        <button
          onClick={onSave}
          disabled={!canSave || isSubmitting}
          className="w-full min-h-12 rounded-xl border border-emerald-400/40 bg-emerald-400/20 px-4 py-3 font-semibold text-emerald-100 transition-all duration-200 hover:border-emerald-300/80 hover:bg-emerald-400/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-emerald-400/10 disabled:bg-emerald-400/5 disabled:text-emerald-400"
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center gap-2">
              <Loader size={14} className="animate-spin" />
              Verifying...
            </div>
          ) : (
            "Continue"
          )}
        </button>
      </div>
    </div>
  );
}

interface ModelConfigFormProps {
  displayName: string;
  modelName: string;
  error: string | null;
  isSaving: boolean;
  canSave: boolean;
  onDisplayNameChange: (value: string) => void;
  onModelNameChange: (value: string) => void;
  onSave: () => void;
  onSkip: () => void;
}

export function ModelConfigForm({
  displayName,
  modelName,
  error,
  isSaving,
  canSave,
  onDisplayNameChange,
  onModelNameChange,
  onSave,
  onSkip,
}: ModelConfigFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/70">Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder="Creative mentor"
          className="w-full min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
        />
        <p className="text-[11px] text-gray-500">How this model appears in menus</p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-white/70">Model Name</label>
        <input
          type="text"
          value={modelName}
          onChange={(e) => onModelNameChange(e.target.value)}
          placeholder="gpt-4o, claude-3-sonnet"
          className="w-full min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
        />
        <p className="text-[11px] text-gray-500">Exact identifier used for API calls</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3">
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      <div className="space-y-2 pt-2">
        <button
          onClick={onSave}
          disabled={!canSave || isSaving}
          className="w-full min-h-12 rounded-xl border border-emerald-400/40 bg-emerald-400/20 px-4 py-3 font-semibold text-emerald-100 transition-all duration-200 hover:border-emerald-300/80 hover:bg-emerald-400/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-emerald-400/10 disabled:bg-emerald-400/5 disabled:text-emerald-400"
        >
          {isSaving ? (
            <div className="flex items-center justify-center gap-2">
              <Loader size={14} className="animate-spin" />
              Verifying...
            </div>
          ) : (
            "Next: Memory System"
          )}
        </button>

        <button
          onClick={onSkip}
          className="w-full min-h-11 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-gray-400 transition-all duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-[0.98]"
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
  );
}
