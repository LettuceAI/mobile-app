import { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  Cpu,
  Image,
  Wand2,
  Check,
  Zap,
  PenTool,
  Eye,
  MessageSquare,
  User,
  FileImage,
  Palette,
  Settings2,
  BookOpen,
  List,
  CheckCircle2,
  Info,
  ChevronDown,
} from "lucide-react";
import { readSettings, saveAdvancedSettings } from "../../../core/storage/repo";
import type { Model } from "../../../core/storage/schemas";
import { cn, colors } from "../../design-tokens";
import { getProviderIcon } from "../../../core/utils/providerIcons";
import { BottomMenu } from "../../components/BottomMenu";

// Tool definitions matching the Rust backend
const CREATION_HELPER_TOOLS = [
  {
    id: "set_character_name",
    name: "Set Name",
    description: "Set the character's name",
    icon: User,
    category: "basic",
  },
  {
    id: "set_character_definition",
    name: "Set Definition",
    description: "Set personality and background",
    icon: PenTool,
    category: "basic",
  },
  {
    id: "add_scene",
    name: "Add Scene",
    description: "Add a starting scene for roleplay",
    icon: BookOpen,
    category: "content",
  },
  {
    id: "update_scene",
    name: "Update Scene",
    description: "Modify an existing scene",
    icon: PenTool,
    category: "content",
  },
  {
    id: "toggle_avatar_gradient",
    name: "Avatar Gradient",
    description: "Toggle gradient overlay on avatar",
    icon: Palette,
    category: "visual",
  },
  {
    id: "set_default_model",
    name: "Set Model",
    description: "Set the AI model for conversations",
    icon: Cpu,
    category: "settings",
  },
  {
    id: "set_system_prompt",
    name: "System Prompt",
    description: "Set behavioral guidelines",
    icon: Settings2,
    category: "settings",
  },
  {
    id: "get_system_prompt_list",
    name: "List Prompts",
    description: "View available prompts",
    icon: List,
    category: "settings",
  },
  {
    id: "get_model_list",
    name: "List Models",
    description: "View available models",
    icon: List,
    category: "settings",
  },
  {
    id: "use_uploaded_image_as_avatar",
    name: "Image as Avatar",
    description: "Use uploaded image as avatar",
    icon: FileImage,
    category: "visual",
  },
  {
    id: "use_uploaded_image_as_chat_background",
    name: "Image as Background",
    description: "Use uploaded image as background",
    icon: Image,
    category: "visual",
  },
  {
    id: "show_preview",
    name: "Show Preview",
    description: "Preview the character",
    icon: Eye,
    category: "flow",
  },
  {
    id: "request_confirmation",
    name: "Request Confirmation",
    description: "Ask to save or continue",
    icon: CheckCircle2,
    category: "flow",
  },
] as const;

const TOOL_CATEGORIES = {
  basic: { label: "Basic", color: "blue" },
  content: { label: "Content", color: "emerald" },
  visual: { label: "Visual", color: "amber" },
  settings: { label: "Settings", color: "rose" },
  flow: { label: "Flow", color: "cyan" },
} as const;

const TOOL_PRESETS = [
  {
    id: "all",
    name: "All Tools",
    description: "Enable all available tools",
    tools: CREATION_HELPER_TOOLS.map((t) => t.id),
  },
  {
    id: "essential",
    name: "Essential",
    description: "Name, definition, and scenes only",
    tools: [
      "set_character_name",
      "set_character_definition",
      "add_scene",
      "show_preview",
      "request_confirmation",
    ],
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Just name and definition",
    tools: ["set_character_name", "set_character_definition", "request_confirmation"],
  },
] as const;

export function CreationHelperPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [models, setModels] = useState<Model[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);

  // Settings state
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [imageModelId, setImageModelId] = useState<string | null>(null);
  const [smartToolSelection, setSmartToolSelection] = useState(true);
  const [enabledTools, setEnabledTools] = useState<string[]>(
    CREATION_HELPER_TOOLS.map((t) => t.id),
  );

  // Menu states
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showImageModelMenu, setShowImageModelMenu] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [imageModelSearchQuery, setImageModelSearchQuery] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const settings = await readSettings();
        setModels(settings.models);
        setDefaultModelId(settings.defaultModelId);
        setSelectedModelId(settings.advancedSettings?.creationHelperModelId ?? null);
        setStreamingEnabled(settings.advancedSettings?.creationHelperStreaming ?? true);
        setImageModelId(settings.advancedSettings?.creationHelperImageModelId ?? null);
        setSmartToolSelection(settings.advancedSettings?.creationHelperSmartToolSelection ?? true);
        setEnabledTools(
          settings.advancedSettings?.creationHelperEnabledTools ??
            CREATION_HELPER_TOOLS.map((t) => t.id),
        );
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
      creationHelperModelId: string | undefined;
      creationHelperStreaming: boolean;
      creationHelperImageModelId: string | undefined;
      creationHelperSmartToolSelection: boolean;
      creationHelperEnabledTools: string[];
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
    await saveSettings({ creationHelperModelId: modelId ?? undefined });
  };

  const handleStreamingToggle = async () => {
    const newValue = !streamingEnabled;
    setStreamingEnabled(newValue);
    await saveSettings({ creationHelperStreaming: newValue });
  };

  const handleImageModelChange = async (modelId: string | null) => {
    setImageModelId(modelId);
    await saveSettings({ creationHelperImageModelId: modelId ?? undefined });
  };

  const handleSmartToolToggle = async () => {
    const newValue = !smartToolSelection;
    setSmartToolSelection(newValue);
    await saveSettings({ creationHelperSmartToolSelection: newValue });
  };

  const handleToolToggle = async (toolId: string) => {
    const newTools = enabledTools.includes(toolId)
      ? enabledTools.filter((t) => t !== toolId)
      : [...enabledTools, toolId];
    setEnabledTools(newTools);
    await saveSettings({ creationHelperEnabledTools: newTools });
  };

  const handlePresetSelect = async (presetId: string) => {
    const preset = TOOL_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setEnabledTools([...preset.tools]);
      await saveSettings({ creationHelperEnabledTools: [...preset.tools] });
    }
  };

  const textModels = useMemo(
    () => models.filter((m) => !m.outputScopes || m.outputScopes.includes("text")),
    [models],
  );

  const imageModels = useMemo(
    () => models.filter((m) => m.outputScopes?.includes("image")),
    [models],
  );

  const selectedModel = selectedModelId ? models.find((m) => m.id === selectedModelId) : null;
  const defaultModel = defaultModelId ? models.find((m) => m.id === defaultModelId) : null;
  const selectedImageModel = imageModelId ? models.find((m) => m.id === imageModelId) : null;

  const currentPreset = useMemo(() => {
    for (const preset of TOOL_PRESETS) {
      if (
        preset.tools.length === enabledTools.length &&
        preset.tools.every((t) => enabledTools.includes(t))
      ) {
        return preset.id;
      }
    }
    return "custom";
  }, [enabledTools]);

  const groupedTools = useMemo(() => {
    const groups: Record<string, (typeof CREATION_HELPER_TOOLS)[number][]> = {};
    for (const tool of CREATION_HELPER_TOOLS) {
      if (!groups[tool.category]) {
        groups[tool.category] = [];
      }
      groups[tool.category].push(tool);
    }
    return groups;
  }, []);

  if (isLoading) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-4 pb-24 pt-4">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          {/* Info Card */}
          <div className={cn("rounded-xl border border-rose-400/20 bg-rose-400/5 p-3")}>
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-200/80 leading-relaxed">
                Creation Helper guides you through building characters with AI assistance. Configure
                the model and tools used during character creation.
              </p>
            </div>
          </div>

          {/* Desktop: Two Column Layout / Mobile: Single Column */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Model Configuration */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35 px-1">
                Model Configuration
              </h3>

              {/* Chat Model Selector */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-1.5">
                    <MessageSquare className="h-4 w-4 text-rose-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Chat Model</h3>
                </div>

                {textModels.length > 0 ? (
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
                      <span
                        className={`text-sm ${selectedModelId ? "text-white" : "text-white/50"}`}
                      >
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
                  AI model for character creation conversations
                </p>
              </div>

              {/* Streaming Toggle */}
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-1.5">
                      <Zap className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-white">Streaming Output</span>
                      <p className="text-[11px] text-white/45">
                        Show responses as they're generated
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
                        streamingEnabled ? "bg-emerald-500" : "bg-white/20",
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

              {/* Image Model Selector */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-1.5">
                    <Image className="h-4 w-4 text-amber-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Image Generation Model</h3>
                </div>

                {imageModels.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowImageModelMenu(true)}
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-left transition hover:bg-black/30 focus:border-white/25 focus:outline-none"
                  >
                    <div className="flex items-center gap-2">
                      {imageModelId ? (
                        getProviderIcon(selectedImageModel?.providerId || "")
                      ) : (
                        <Image className="h-5 w-5 text-white/40" />
                      )}
                      <span className={`text-sm ${imageModelId ? "text-white" : "text-white/50"}`}>
                        {imageModelId
                          ? selectedImageModel?.displayName || "Selected Model"
                          : "No model selected"}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-white/40" />
                  </button>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-sm text-white/50">No image models available</p>
                  </div>
                )}
                <p className="text-xs text-white/50 px-1">For generating character avatars</p>
              </div>
            </div>

            {/* Right Column - Tool Selection */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35 px-1">
                Tool Selection
              </h3>

              {/* Smart Tool Selection Toggle */}
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border border-blue-400/30 bg-blue-400/10 p-1.5">
                      <Wand2 className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-white">Smart Tool Selection</span>
                      <p className="text-[11px] text-white/45">
                        AI automatically chooses which tools to use
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smartToolSelection}
                      onChange={handleSmartToolToggle}
                      className="sr-only peer"
                    />
                    <div
                      className={cn(
                        "w-9 h-5 rounded-full transition-colors",
                        smartToolSelection ? "bg-blue-500" : "bg-white/20",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                          smartToolSelection && "translate-x-4",
                        )}
                      />
                    </div>
                  </label>
                </div>
              </div>

              {/* Tool Presets - shown when smart selection is OFF */}
              {!smartToolSelection && (
                <>
                  <div className="space-y-3">
                    <p className="text-xs text-white/50 px-1">Quick Presets</p>
                    <div className="grid grid-cols-3 gap-2">
                      {TOOL_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => handlePresetSelect(preset.id)}
                          className={cn(
                            "rounded-xl border px-3 py-2.5 text-center transition-all",
                            currentPreset === preset.id
                              ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
                              : "border-white/10 bg-white/5 text-white/60 hover:border-white/20",
                          )}
                        >
                          <span className="text-xs font-medium">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                    {currentPreset === "custom" && (
                      <p className="text-[11px] text-amber-200/70 px-1">
                        Custom selection — {enabledTools.length} tools enabled
                      </p>
                    )}
                  </div>

                  {/* Tool List */}
                  <div className="space-y-4">
                    {Object.entries(groupedTools).map(([category, tools]) => {
                      const categoryInfo =
                        TOOL_CATEGORIES[category as keyof typeof TOOL_CATEGORIES];
                      const colorMap = {
                        blue: {
                          badge: "border-blue-400/30 bg-blue-500/10 text-blue-300",
                        },
                        emerald: {
                          badge: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
                        },
                        amber: {
                          badge: "border-amber-400/30 bg-amber-500/10 text-amber-300",
                        },
                        rose: {
                          badge: "border-rose-400/30 bg-rose-500/10 text-rose-300",
                        },
                        cyan: {
                          badge: "border-cyan-400/30 bg-cyan-500/10 text-cyan-300",
                        },
                      };

                      const categoryColors = colorMap[categoryInfo.color as keyof typeof colorMap];

                      return (
                        <div key={category} className="space-y-2">
                          <div className="flex items-center gap-2 px-1">
                            <span
                              className={cn(
                                "rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                                categoryColors.badge,
                              )}
                            >
                              {categoryInfo.label}
                            </span>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden divide-y divide-white/5">
                            {tools.map((tool) => {
                              const Icon = tool.icon;
                              const isEnabled = enabledTools.includes(tool.id);

                              return (
                                <button
                                  key={tool.id}
                                  onClick={() => handleToolToggle(tool.id)}
                                  className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 text-left",
                                    "transition-colors hover:bg-white/5",
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                                      isEnabled
                                        ? "border-white/20 bg-white/10"
                                        : "border-white/10 bg-white/5",
                                    )}
                                  >
                                    <Icon
                                      className={cn(
                                        "h-4 w-4 transition-colors",
                                        isEnabled ? "text-white/70" : "text-white/30",
                                      )}
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span
                                      className={cn(
                                        "text-sm font-medium",
                                        isEnabled ? "text-white" : "text-white/50",
                                      )}
                                    >
                                      {tool.name}
                                    </span>
                                    <p className="text-[11px] text-white/40 truncate">
                                      {tool.description}
                                    </p>
                                  </div>
                                  <div
                                    className={cn(
                                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all",
                                      isEnabled
                                        ? "border-emerald-400/50 bg-emerald-500/20"
                                        : "border-white/15 bg-white/5",
                                    )}
                                  >
                                    {isEnabled && <Check className="h-3 w-3 text-emerald-300" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bottom Info Card - Full Width */}
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
                When <strong className="text-white/60">Smart Tool Selection</strong> is enabled, the
                AI decides which tools to use based on context. Disable it to manually control which
                tools are available.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Chat Model Selection BottomMenu */}
      <BottomMenu
        isOpen={showModelMenu}
        onClose={() => {
          setShowModelMenu(false);
          setModelSearchQuery("");
        }}
        title="Select Chat Model"
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
            {textModels
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

      {/* Image Model Selection BottomMenu */}
      <BottomMenu
        isOpen={showImageModelMenu}
        onClose={() => {
          setShowImageModelMenu(false);
          setImageModelSearchQuery("");
        }}
        title="Select Image Model"
      >
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={imageModelSearchQuery}
              onChange={(e) => setImageModelSearchQuery(e.target.value)}
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
                handleImageModelChange(null);
                setShowImageModelMenu(false);
                setImageModelSearchQuery("");
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition",
                !imageModelId
                  ? "border-emerald-400/40 bg-emerald-400/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10",
              )}
            >
              <Image className="h-5 w-5 text-white/40" />
              <span className="text-sm text-white">No model selected</span>
              {!imageModelId && <Check className="h-4 w-4 ml-auto text-emerald-400" />}
            </button>
            {imageModels
              .filter((model) => {
                if (!imageModelSearchQuery) return true;
                const q = imageModelSearchQuery.toLowerCase();
                return (
                  model.displayName?.toLowerCase().includes(q) ||
                  model.name?.toLowerCase().includes(q)
                );
              })
              .map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    handleImageModelChange(model.id);
                    setShowImageModelMenu(false);
                    setImageModelSearchQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition",
                    imageModelId === model.id
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
                  {imageModelId === model.id && (
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
