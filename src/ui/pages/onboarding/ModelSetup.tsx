import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Loader, Settings, Sparkles } from "lucide-react";

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
      const model: Omit<Model, "id"> = {
        name: modelName.trim(),
        providerId: selectedProvider.id,
        displayName: displayName.trim(),
        createdAt: Date.now(),
      };

      await addOrUpdateModel(model);

      localStorage_.setOnboardingCompleted(true);
      localStorage_.setModelSetupCompleted(true);

      navigate("/chat?firstTime=true");
    } catch (error: any) {
      console.error("Failed to save model:", error);
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
          onClick={() => navigate("/onboarding/provider")}
          className="rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/20"
        >
          Go to provider setup
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 pb-12 text-gray-200">
      <header className="relative overflow-hidden rounded-3xl border border-white/5 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_rgba(5,5,5,0.85))] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.5)]">
        <div className="absolute right-[-4rem] top-[-4rem] h-48 w-48 rounded-full bg-white/10 blur-3xl opacity-50" />
        <div className="absolute bottom-[-5rem] left-[-6rem] h-64 w-64 rounded-full bg-white/10 blur-3xl opacity-35" />
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <button
              onClick={() => navigate("/onboarding/provider")}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-300 transition hover:border-white/30 hover:text-white"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-gray-500">Step 2 of 2</p>
              <h1 className="text-xl font-semibold text-white">Set your default model</h1>
            </div>
          </div>
          <p className="max-w-[220px] text-xs text-gray-400">
            Choose which provider and model name LettuceAI should use by default. You'll be able to add more later.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1.05fr_1.05fr]">
        <section className="space-y-5 rounded-3xl border border-white/5 bg-black/45 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Select a provider</h2>
              <p className="text-xs text-gray-500">We'll save the model under this provider.</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.35em] text-gray-400">
              Linked
            </span>
          </header>

          <div className="space-y-3">
            {providers.map((provider) => {
              const isActive = selectedProvider?.id === provider.id;
              return (
                <button
                  key={provider.id}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    isActive
                      ? "border-white/25 bg-white/15 shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
                      : "border-white/5 bg-black/40 hover:border-white/15 hover:bg-black/35"
                  }`}
                  onClick={() => {
                    setSelectedProvider(provider);
                    const defaultModel = getDefaultModelName(provider.providerId);
                    setModelName(defaultModel);
                    setDisplayName(defaultModel);
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{provider.label}</h3>
                      <p className="text-xs text-gray-400">{getProviderDisplayName(provider.providerId)}</p>
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

        <section className="space-y-6 rounded-3xl border border-white/5 bg-black/45 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
          <header>
            <h2 className="text-base font-semibold text-white">Model details</h2>
            <p className="text-xs text-gray-500">
              Define the API identifier and the label you'll see inside the app.
            </p>
          </header>

          {selectedProvider && (
            <div className="space-y-5">
              <Field label="Model name" description="Exact identifier used for API calls.">
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="gpt-4o, claude-3-sonnet"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
                />
              </Field>

              <Field label="Display name" description="How this model appears in menus.">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Creative mentor"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
                />
              </Field>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleSkip}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/20"
            >
              Skip for now
            </button>
            <button
              onClick={handleSaveModel}
              disabled={!canSave || isSaving}
              className="flex-1 rounded-full border border-emerald-400/40 bg-emerald-400/20 px-6 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/80 hover:bg-emerald-400/30 disabled:cursor-not-allowed disabled:border-emerald-400/10 disabled:bg-emerald-400/5 disabled:text-emerald-400"
            >
              {isSaving ? "Saving..." : "Finish"}
            </button>
          </div>

          {!canSave && (
            <p className="text-xs text-gray-500">
              Fill out both fields above to enable the finish button.
            </p>
          )}
        </section>
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

function getDefaultModelName(providerId: string): string {
  switch (providerId) {
    case "openai":
      return "gpt-4o";
    case "anthropic":
      return "claude-3-sonnet";
    case "openrouter":
      return "meta-llama/llama-3-70b-instruct";
    default:
      return "custom-model";
  }
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 text-sm">
      <label className="text-sm font-semibold text-white">{label}</label>
      {description && <p className="text-xs text-gray-500">{description}</p>}
      {children}
    </div>
  );
}
