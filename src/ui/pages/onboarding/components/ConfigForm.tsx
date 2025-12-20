import { AlertCircle, Loader } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { TestResult } from "../hooks/onboardingReducer";

interface ProviderConfigFormProps {
    selectedProviderId: string;
    selectedProviderName?: string;
    label: string;
    apiKey: string;
    baseUrl: string;
    testResult: TestResult;
    isTesting: boolean;
    isSubmitting: boolean;
    canTest: boolean;
    canSave: boolean;
    onLabelChange: (value: string) => void;
    onApiKeyChange: (value: string) => void;
    onBaseUrlChange: (value: string) => void;
    onTestConnection: () => void;
    onSave: () => void;
}

export function ProviderConfigForm({
    selectedProviderId,
    selectedProviderName,
    label,
    apiKey,
    baseUrl,
    testResult,
    isTesting,
    isSubmitting,
    canTest,
    canSave,
    onLabelChange,
    onApiKeyChange,
    onBaseUrlChange,
    onTestConnection,
    onSave,
}: ProviderConfigFormProps) {
    const navigate = useNavigate();

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
                    <label className="text-xs font-medium text-white/70">API Key</label>
                    <button
                        onClick={() => navigate(`/wheretofind${selectedProviderId ? `?provider=${selectedProviderId}` : ""}`)}
                        className="text-[11px] text-gray-400 hover:text-white transition-colors"
                    >
                        Where to find it
                    </button>
                </div>
                <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                    placeholder="sk-..."
                    className="w-full min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
                />
                <p className="text-[11px] text-gray-500">Keys are encrypted locally</p>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-medium text-white/70">Base URL (Optional)</label>
                <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => onBaseUrlChange(e.target.value)}
                    placeholder="https://api.provider.com"
                    className="w-full min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-white/30 focus:outline-none"
                />
                <p className="text-[11px] text-gray-500">Override the default endpoint if needed</p>
            </div>

            {testResult && (
                <div className={`rounded-xl border px-4 py-3 text-sm ${testResult.success
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                    : "border-amber-400/40 bg-amber-400/10 text-amber-200"
                    }`}>
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
