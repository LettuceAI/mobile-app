import { useState, useEffect } from "react";
import {
  MessageSquare,
  Cpu,
  Zap,
  Hash,
  Info,
  Check,
  ChevronDown,
  MessageCircle,
  BookOpen,
} from "lucide-react";
import { readSettings, saveAdvancedSettings } from "../../../core/storage/repo";
import type { Model } from "../../../core/storage/schemas";
import { cn, colors } from "../../design-tokens";
import { getProviderIcon } from "../../../core/utils/providerIcons";
import { BottomMenu } from "../../components/BottomMenu";

type ReplyStyle = "conversational" | "roleplay";

export function HelpMeReplyPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [models, setModels] = useState<Model[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);

  // Settings state
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [maxTokens, setMaxTokens] = useState(150);
  const [maxTokensInput, setMaxTokensInput] = useState("150");
  const [replyStyle, setReplyStyle] = useState<ReplyStyle>("conversational");

  // Menu states
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const settings = await readSettings();
        const textModels = settings.models.filter(
          (m) => !m.outputScopes || m.outputScopes.includes("text"),
        );
        setModels(textModels);
        setDefaultModelId(settings.defaultModelId);
        setSelectedModelId(settings.advancedSettings?.helpMeReplyModelId ?? null);
        setStreamingEnabled(settings.advancedSettings?.helpMeReplyStreaming ?? true);
        const tokens = settings.advancedSettings?.helpMeReplyMaxTokens ?? 150;
        setMaxTokens(tokens);
        setMaxTokensInput(String(tokens));
        setReplyStyle(settings.advancedSettings?.helpMeReplyStyle ?? "conversational");
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load settings:", err);
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const saveSettings = async (
    updates: Partial<{
      helpMeReplyModelId: string | undefined;
      helpMeReplyStreaming: boolean;
      helpMeReplyMaxTokens: number;
      helpMeReplyStyle: ReplyStyle;
    }>,
  ) => {
    try {
      const settings = await readSettings();
      const advanced = settings.advancedSettings ?? {
        creationHelperEnabled: false,
        helpMeReplyEnabled: true,
      };
      Object.assign(advanced, updates);
      await saveAdvancedSettings(advanced);
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  const handleModelChange = async (modelId: string | null) => {
    setSelectedModelId(modelId);
    await saveSettings({ helpMeReplyModelId: modelId ?? undefined });
  };

  const handleStreamingToggle = async () => {
    const newValue = !streamingEnabled;
    setStreamingEnabled(newValue);
    await saveSettings({ helpMeReplyStreaming: newValue });
  };

  const handleMaxTokensChange = async (value: number) => {
    setMaxTokens(value);
    setMaxTokensInput(String(value));
    await saveSettings({ helpMeReplyMaxTokens: value });
  };

  const handleMaxTokensBlur = async () => {
    const val = parseInt(maxTokensInput);
    if (!isNaN(val) && val >= 1) {
      setMaxTokens(val);
      await saveSettings({ helpMeReplyMaxTokens: val });
    } else {
      setMaxTokensInput(String(maxTokens));
    }
  };

  const handleStyleChange = async (style: ReplyStyle) => {
    setReplyStyle(style);
    await saveSettings({ helpMeReplyStyle: style });
  };

  const selectedModel = selectedModelId ? models.find((m) => m.id === selectedModelId) : null;
  const defaultModel = defaultModelId ? models.find((m) => m.id === defaultModelId) : null;

  if (isLoading) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-4 pb-24 pt-4">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          {/* Info Card */}
          <div className={cn("rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3")}>
            <div className="flex items-start gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-200/80 leading-relaxed">
                Help Me Reply generates contextual suggestions for your next message based on
                conversation history. Configure the model and response style below.
              </p>
            </div>
          </div>

          {/* Model Configuration Section */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35 px-1">
              Model Configuration
            </h3>

            {/* Model Selector */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-1.5">
                  <Cpu className="h-4 w-4 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold text-white">Reply Model</h3>
              </div>

              {models.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowModelMenu(true)}
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-left transition hover:bg-black/30 focus:border-white/25 focus:outline-none"
                >
                  <div className="flex items-center gap-2">
                    {selectedModelId ? (
                      getProviderIcon(selectedModel?.providerId || "")
                    ) : (
                      <Cpu className="h-5 w-5 text-white/40" />
                    )}
                    <span className={`text-sm ${selectedModelId ? "text-white" : "text-white/50"}`}>
                      {selectedModelId
                        ? selectedModel?.displayName || "Selected Model"
                        : `Use app default${defaultModel ? ` (${defaultModel.displayName})` : ""}`}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-white/40" />
                </button>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-sm text-white/50">No models available</p>
                </div>
              )}
              <p className="text-xs text-white/50 px-1">
                AI model for generating reply suggestions
              </p>
            </div>

            {/* Streaming Toggle */}
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border border-blue-400/30 bg-blue-400/10 p-1.5">
                    <Zap className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white">Streaming Output</span>
                    <p className="text-[11px] text-white/45">
                      Show suggestions as they're generated
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={streamingEnabled}
                    onChange={handleStreamingToggle}
                    className="sr-only peer"
                  />
                  <div
                    className={cn(
                      "w-9 h-5 rounded-full transition-colors",
                      streamingEnabled ? "bg-blue-500" : "bg-white/20",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                        streamingEnabled && "translate-x-4",
                      )}
                    />
                  </div>
                </label>
              </div>
            </div>

            {/* Max Tokens */}
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-1.5">
                    <Hash className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white">Max Tokens</span>
                    <p className="text-[11px] text-white/45">Maximum length of suggestions</p>
                  </div>
                </div>
                <input
                  type="number"
                  value={maxTokensInput}
                  onChange={(e) => setMaxTokensInput(e.target.value)}
                  onBlur={handleMaxTokensBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                  min={1}
                  className={cn(
                    "w-20 rounded-lg border border-white/15 bg-black/30 px-3 py-1.5",
                    "text-center font-mono text-sm text-white",
                    "focus:border-white/30 focus:outline-none",
                  )}
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[100, 150, 250, 400].map((val) => (
                  <button
                    key={val}
                    onClick={() => handleMaxTokensChange(val)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-xs font-medium transition-all",
                      maxTokens === val
                        ? "bg-amber-500/20 border border-amber-400/40 text-amber-200"
                        : "border border-white/10 bg-white/5 text-white/60 hover:border-white/20",
                    )}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Response Style Section */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35 px-1">
              Response Style
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {/* Conversational Style */}
              <button
                onClick={() => handleStyleChange("conversational")}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border p-4 transition-all",
                  replyStyle === "conversational"
                    ? "border-emerald-400/40 bg-emerald-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20",
                )}
              >
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full border transition-all",
                    replyStyle === "conversational"
                      ? "border-emerald-400/50 bg-emerald-500/20"
                      : "border-white/15 bg-white/5",
                  )}
                >
                  <MessageCircle
                    className={cn(
                      "h-6 w-6 transition-colors",
                      replyStyle === "conversational" ? "text-emerald-300" : "text-white/50",
                    )}
                  />
                </div>
                <div className="text-center">
                  <span
                    className={cn(
                      "text-sm font-semibold block",
                      replyStyle === "conversational" ? "text-emerald-100" : "text-white/70",
                    )}
                  >
                    Conversational
                  </span>
                  <span className="text-[10px] text-white/40 mt-1 block">Natural, casual tone</span>
                </div>
                {replyStyle === "conversational" && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>

              {/* Roleplay Style */}
              <button
                onClick={() => handleStyleChange("roleplay")}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border p-4 transition-all",
                  replyStyle === "roleplay"
                    ? "border-rose-400/40 bg-rose-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20",
                )}
              >
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full border transition-all",
                    replyStyle === "roleplay"
                      ? "border-rose-400/50 bg-rose-500/20"
                      : "border-white/15 bg-white/5",
                  )}
                >
                  <BookOpen
                    className={cn(
                      "h-6 w-6 transition-colors",
                      replyStyle === "roleplay" ? "text-rose-300" : "text-white/50",
                    )}
                  />
                </div>
                <div className="text-center">
                  <span
                    className={cn(
                      "text-sm font-semibold block",
                      replyStyle === "roleplay" ? "text-rose-100" : "text-white/70",
                    )}
                  >
                    Roleplay
                  </span>
                  <span className="text-[10px] text-white/40 mt-1 block">In-character actions</span>
                </div>
                {replyStyle === "roleplay" && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            </div>

            <p className="text-xs text-white/50 px-1">
              {replyStyle === "conversational"
                ? "Suggestions will be written as natural dialogue, suitable for casual chats."
                : "Suggestions will include roleplay elements like *actions* and narrative descriptions."}
            </p>
          </div>

          {/* Bottom Info Card */}
          <div
            className={cn(
              "rounded-xl border px-4 py-3.5",
              colors.glass.subtle,
              "flex items-start gap-3",
            )}
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
            <div className="text-[11px] leading-relaxed text-white/45">
              <p>
                This setting applies globally across all conversations. Lower token counts generate
                shorter, quicker suggestions while higher counts allow for more detailed responses.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Model Selection BottomMenu */}
      <BottomMenu
        isOpen={showModelMenu}
        onClose={() => {
          setShowModelMenu(false);
          setModelSearchQuery("");
        }}
        title="Select Reply Model"
      >
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={modelSearchQuery}
              onChange={(e) => setModelSearchQuery(e.target.value)}
              placeholder="Search models..."
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 pl-10 text-sm text-white placeholder-white/40 focus:border-white/20 focus:outline-none"
            />
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            <button
              onClick={() => {
                handleModelChange(null);
                setShowModelMenu(false);
                setModelSearchQuery("");
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition",
                !selectedModelId
                  ? "border-emerald-400/40 bg-emerald-400/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10",
              )}
            >
              <Cpu className="h-5 w-5 text-white/40" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white">Use app default</span>
                {defaultModel && (
                  <span className="block truncate text-xs text-white/40">
                    {defaultModel.displayName}
                  </span>
                )}
              </div>
              {!selectedModelId && <Check className="h-4 w-4 ml-auto text-emerald-400" />}
            </button>
            {models
              .filter((model) => {
                if (!modelSearchQuery) return true;
                const q = modelSearchQuery.toLowerCase();
                return (
                  model.displayName?.toLowerCase().includes(q) ||
                  model.name?.toLowerCase().includes(q)
                );
              })
              .map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    handleModelChange(model.id);
                    setShowModelMenu(false);
                    setModelSearchQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition",
                    selectedModelId === model.id
                      ? "border-emerald-400/40 bg-emerald-400/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10",
                  )}
                >
                  {getProviderIcon(model.providerId)}
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-sm text-white">
                      {model.displayName || model.name}
                    </span>
                    <span className="block truncate text-xs text-white/40">{model.name}</span>
                  </div>
                  {selectedModelId === model.id && (
                    <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                  )}
                </button>
              ))}
          </div>
        </div>
      </BottomMenu>
    </div>
  );
}
