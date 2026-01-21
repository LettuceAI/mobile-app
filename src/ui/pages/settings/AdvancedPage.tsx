import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  ChevronRight,
  HelpCircle,
  PenLine,
  Brain,
  Cpu,
  Info,
  MessageSquare,
  Zap,
} from "lucide-react";
import {
  readSettings,
  saveAdvancedSettings,
  checkEmbeddingModel,
} from "../../../core/storage/repo";
import type { Settings } from "../../../core/storage/schemas";
import { cn, typography, spacing, interactive, colors } from "../../design-tokens";
import { EmbeddingDownloadPrompt } from "../../components/EmbeddingDownloadPrompt";
import { openDocs, DOCS } from "../../../core/utils/docs";

type DocsKey = keyof typeof DOCS;

interface FeatureCardProps {
  title: string;
  description: string;
  detailText?: string;
  icon: React.ReactNode;
  enabled: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  colorScheme: "rose" | "blue" | "emerald" | "amber" | "violet";
  badge?: string;
  helpKey?: DocsKey;
}

function FeatureCard({
  title,
  description,
  detailText,
  icon,
  enabled,
  onToggle,
  onNavigate,
  colorScheme,
  badge,
  helpKey,
}: FeatureCardProps) {
  const colorStyles = {
    rose: {
      border: enabled ? "border-rose-400/25" : "border-white/10",
      bg: enabled ? "bg-rose-400/8" : "bg-white/5",
      hoverBorder: enabled ? "hover:border-rose-400/40" : "hover:border-white/20",
      iconBorder: enabled ? "border-rose-400/40" : "border-white/15",
      iconBg: enabled ? "bg-rose-500/15" : "bg-white/8",
      iconShadow: enabled ? "shadow-rose-500/20" : "",
      iconColor: enabled ? "text-rose-300" : "text-white/60",
      toggleBg: enabled ? "bg-rose-500" : "bg-white/20",
      toggleShadow: enabled ? "shadow-rose-500/30" : "",
      badgeBorder: enabled ? "border-rose-400/50" : "border-white/20",
      badgeBg: enabled ? "bg-rose-500/20" : "bg-white/10",
      badgeText: enabled ? "text-rose-200" : "text-white/60",
      gradient: enabled
        ? "radial-gradient(circle at 15% 15%, rgba(244,63,94,0.08) 0%, transparent 50%)"
        : "none",
    },
    blue: {
      border: enabled ? "border-blue-400/25" : "border-white/10",
      bg: enabled ? "bg-blue-400/8" : "bg-white/5",
      hoverBorder: enabled ? "hover:border-blue-400/40" : "hover:border-white/20",
      iconBorder: enabled ? "border-blue-400/40" : "border-white/15",
      iconBg: enabled ? "bg-blue-500/15" : "bg-white/8",
      iconShadow: enabled ? "shadow-blue-500/20" : "",
      iconColor: enabled ? "text-blue-300" : "text-white/60",
      toggleBg: enabled ? "bg-blue-500" : "bg-white/20",
      toggleShadow: enabled ? "shadow-blue-500/30" : "",
      badgeBorder: enabled ? "border-blue-400/50" : "border-orange-400/40",
      badgeBg: enabled ? "bg-blue-500/20" : "bg-orange-500/15",
      badgeText: enabled ? "text-blue-200" : "text-orange-200",
      gradient: enabled
        ? "radial-gradient(circle at 15% 15%, rgba(59,130,246,0.06) 0%, transparent 50%)"
        : "none",
    },
    emerald: {
      border: enabled ? "border-emerald-400/25" : "border-white/10",
      bg: enabled ? "bg-emerald-400/8" : "bg-white/5",
      hoverBorder: enabled ? "hover:border-emerald-400/40" : "hover:border-white/20",
      iconBorder: enabled ? "border-emerald-400/40" : "border-white/15",
      iconBg: enabled ? "bg-emerald-500/15" : "bg-white/8",
      iconShadow: enabled ? "shadow-emerald-500/20" : "",
      iconColor: enabled ? "text-emerald-300" : "text-white/60",
      toggleBg: enabled ? "bg-emerald-500" : "bg-white/20",
      toggleShadow: enabled ? "shadow-emerald-500/30" : "",
      badgeBorder: enabled ? "border-emerald-400/50" : "border-orange-400/40",
      badgeBg: enabled ? "bg-emerald-500/20" : "bg-orange-500/15",
      badgeText: enabled ? "text-emerald-200" : "text-orange-200",
      gradient: enabled
        ? "radial-gradient(circle at 15% 15%, rgba(16,185,129,0.08) 0%, transparent 50%)"
        : "none",
    },
    amber: {
      border: enabled ? "border-amber-400/25" : "border-white/10",
      bg: enabled ? "bg-amber-400/8" : "bg-white/5",
      hoverBorder: enabled ? "hover:border-amber-400/40" : "hover:border-white/20",
      iconBorder: enabled ? "border-amber-400/40" : "border-white/15",
      iconBg: enabled ? "bg-amber-500/15" : "bg-white/8",
      iconShadow: enabled ? "shadow-amber-500/20" : "",
      iconColor: enabled ? "text-amber-300" : "text-white/60",
      toggleBg: enabled ? "bg-amber-500" : "bg-white/20",
      toggleShadow: enabled ? "shadow-amber-500/30" : "",
      badgeBorder: enabled ? "border-amber-400/50" : "border-white/20",
      badgeBg: enabled ? "bg-amber-500/20" : "bg-white/10",
      badgeText: enabled ? "text-amber-200" : "text-white/60",
      gradient: enabled
        ? "radial-gradient(circle at 15% 15%, rgba(251,191,36,0.08) 0%, transparent 50%)"
        : "none",
    },
    violet: {
      border: enabled ? "border-violet-400/25" : "border-white/10",
      bg: enabled ? "bg-violet-400/8" : "bg-white/5",
      hoverBorder: enabled ? "hover:border-violet-400/40" : "hover:border-white/20",
      iconBorder: enabled ? "border-violet-400/40" : "border-white/15",
      iconBg: enabled ? "bg-violet-500/15" : "bg-white/8",
      iconShadow: enabled ? "shadow-violet-500/20" : "",
      iconColor: enabled ? "text-violet-300" : "text-white/60",
      toggleBg: enabled ? "bg-violet-500" : "bg-white/20",
      toggleShadow: enabled ? "shadow-violet-500/30" : "",
      badgeBorder: enabled ? "border-violet-400/50" : "border-white/20",
      badgeBg: enabled ? "bg-violet-500/20" : "bg-white/10",
      badgeText: enabled ? "text-violet-200" : "text-white/60",
      gradient: enabled
        ? "radial-gradient(circle at 15% 15%, rgba(139,92,246,0.08) 0%, transparent 50%)"
        : "none",
    },
  };

  const style = colorStyles[colorScheme];
  const toggleId = `toggle-${title.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <button
      onClick={onNavigate}
      className={cn(
        "group w-full text-left",
        "relative overflow-hidden rounded-xl border px-4 py-3.5",
        "transition-all duration-300",
        style.border,
        style.bg,
        style.hoverBorder,
        interactive.active.scale,
        interactive.focus.ring,
      )}
    >
      {enabled && (
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: style.gradient }}
        />
      )}

      <div className="relative flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
            "transition-all duration-300",
            style.iconBorder,
            style.iconBg,
            enabled && "shadow-lg",
            style.iconShadow,
          )}
        >
          <span className={cn("transition-colors duration-300", style.iconColor)}>{icon}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={cn(typography.body.size, "font-medium text-white")}>{title}</span>
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5",
                    "text-[9px] font-semibold leading-none uppercase tracking-[0.2em]",
                    "transition-all duration-300",
                    style.badgeBorder,
                    style.badgeBg,
                    style.badgeText,
                  )}
                >
                  {enabled ? "On" : "Off"}
                </span>
                {badge && (
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5",
                      "text-[9px] font-medium leading-none uppercase tracking-wider",
                      "border-white/10 bg-white/5 text-white/40",
                    )}
                  >
                    {badge}
                  </span>
                )}
                {helpKey && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDocs(helpKey);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        openDocs(helpKey);
                      }
                    }}
                    className="p-0.5 text-white/30 transition-colors hover:text-white/60"
                    aria-label={`Help with ${title}`}
                  >
                    <HelpCircle size={14} />
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-white/50">{description}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <input
                id={toggleId}
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                onClick={(e) => e.stopPropagation()}
                className="peer sr-only"
              />
              <label
                htmlFor={toggleId}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full",
                  "border-2 border-transparent transition-all duration-200 ease-in-out",
                  "focus:outline-none focus:ring-2 focus:ring-white/20",
                  style.toggleBg,
                  enabled && "shadow-md",
                  style.toggleShadow,
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm",
                    "ring-0 transition duration-200 ease-in-out",
                    enabled ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </label>
              <ChevronRight
                className={cn(
                  "h-4 w-4 shrink-0 text-white/25 transition-colors",
                  "group-hover:text-white/50",
                )}
              />
            </div>
          </div>

          {detailText && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-white/40">{detailText}</p>
          )}
        </div>
      </div>
    </button>
  );
}

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

function SettingsSection({ title, children, icon }: SettingsSectionProps) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2 px-1">
        {icon && <span className="text-white/30">{icon}</span>}
        <h2
          className={cn(
            typography.overline.size,
            typography.overline.weight,
            typography.overline.tracking,
            typography.overline.transform,
            "text-white/40",
          )}
        >
          {title}
        </h2>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

export function AdvancedPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);

  // Settings state
  const [creationHelperEnabled, setCreationHelperEnabled] = useState(false);
  const [dynamicMemoryEnabled, setDynamicMemoryEnabled] = useState(false);
  const [helpMeReplyEnabled, setHelpMeReplyEnabled] = useState(true);
  const [manualWindow, setManualWindow] = useState<number | null>(50);

  const getAdvancedSettings = (settings: Settings) => {
    const advanced = settings.advancedSettings ?? {
      creationHelperEnabled: false,
      helpMeReplyEnabled: true,
    };
    if (advanced.creationHelperEnabled === undefined) {
      advanced.creationHelperEnabled = false;
    }
    if (advanced.helpMeReplyEnabled === undefined) {
      advanced.helpMeReplyEnabled = true;
    }
    settings.advancedSettings = advanced;
    return advanced;
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const settings = await readSettings();

        setCreationHelperEnabled(settings.advancedSettings?.creationHelperEnabled ?? false);
        setDynamicMemoryEnabled(settings.advancedSettings?.dynamicMemory?.enabled ?? false);
        setHelpMeReplyEnabled(settings.advancedSettings?.helpMeReplyEnabled ?? true);
        setManualWindow(settings.advancedSettings?.manualModeContextWindow ?? 50);

        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load settings:", err);
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleToggleCreationHelper = async () => {
    const newValue = !creationHelperEnabled;
    setCreationHelperEnabled(newValue);

    try {
      const settings = await readSettings();
      const advanced = getAdvancedSettings(settings);
      advanced.creationHelperEnabled = newValue;

      if (newValue && !advanced.creationHelperModelId && settings.defaultModelId) {
        advanced.creationHelperModelId = settings.defaultModelId;
      }

      await saveAdvancedSettings(advanced);
    } catch (err) {
      console.error("Failed to save creation helper setting:", err);
      setCreationHelperEnabled(!newValue);
    }
  };

  const handleToggleDynamicMemory = async () => {
    const newValue = !dynamicMemoryEnabled;

    if (newValue) {
      try {
        const modelExists = await checkEmbeddingModel();
        if (!modelExists) {
          setShowDownloadPrompt(true);
          return;
        }
      } catch (err) {
        console.error("Failed to check embedding model:", err);
        return;
      }
    }

    setDynamicMemoryEnabled(newValue);

    try {
      const settings = await readSettings();
      const advanced = getAdvancedSettings(settings);
      if (!advanced.dynamicMemory) {
        advanced.dynamicMemory = {
          enabled: false,
          summaryMessageInterval: 20,
          maxEntries: 50,
          minSimilarityThreshold: 0.35,
          hotMemoryTokenBudget: 2000,
          decayRate: 0.08,
          coldThreshold: 0.3,
          contextEnrichmentEnabled: true,
        };
      }

      if (newValue && !advanced.summarisationModelId && settings.defaultModelId) {
        advanced.summarisationModelId = settings.defaultModelId;
      }

      advanced.dynamicMemory.enabled = newValue;
      await saveAdvancedSettings(advanced);
    } catch (err) {
      console.error("Failed to save dynamic memory setting:", err);
      setDynamicMemoryEnabled(!newValue);
    }
  };

  const handleManualWindowChange = async (value: number | null) => {
    setManualWindow(value);

    try {
      const settings = await readSettings();
      const advanced = getAdvancedSettings(settings);
      advanced.manualModeContextWindow = value === null ? 50 : value;
      await saveAdvancedSettings(advanced);
    } catch (err) {
      console.error("Failed to save manual window setting:", err);
    }
  };

  const handleToggleHelpMeReply = async () => {
    const newValue = !helpMeReplyEnabled;
    setHelpMeReplyEnabled(newValue);

    try {
      const settings = await readSettings();
      const advanced = getAdvancedSettings(settings);
      advanced.helpMeReplyEnabled = newValue;
      await saveAdvancedSettings(advanced);
    } catch (err) {
      console.error("Failed to save help me reply setting:", err);
      setHelpMeReplyEnabled(!newValue);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col pb-16">
      <section className={cn("flex-1 overflow-y-auto px-3 pt-3", spacing.section)}>
        {/* AI Features Section */}
        <SettingsSection title="AI Features" icon={<Zap size={12} />}>
          <FeatureCard
            title="Creation Helper"
            description="AI-guided character creation wizard"
            detailText="Get intelligent suggestions for personality traits, backstory, and dialogue style"
            icon={<Sparkles className="h-4 w-4" />}
            enabled={creationHelperEnabled}
            onToggle={handleToggleCreationHelper}
            onNavigate={() => navigate("/settings/advanced/creation-helper")}
            colorScheme="rose"
            helpKey="creationHelper"
          />

          <FeatureCard
            title="Help Me Reply"
            description="AI-assisted reply suggestions"
            detailText="Generate contextual response options based on conversation history"
            icon={<PenLine className="h-4 w-4" />}
            enabled={helpMeReplyEnabled}
            onToggle={handleToggleHelpMeReply}
            onNavigate={() => navigate("/settings/advanced/help-me-reply")}
            colorScheme="emerald"
          />
        </SettingsSection>

        {/* Memory System Section */}
        <SettingsSection title="Memory System" icon={<Brain size={12} />}>
          <FeatureCard
            title="Dynamic Memory"
            description={
              dynamicMemoryEnabled
                ? "AI automatically manages conversation context"
                : "Switch to automatic memory management"
            }
            detailText="Semantic search enables intelligent memory recall across conversations"
            icon={<Cpu className="h-4 w-4" />}
            enabled={dynamicMemoryEnabled}
            onToggle={handleToggleDynamicMemory}
            onNavigate={() => navigate("/settings/advanced/memory")}
            colorScheme="blue"
          />

          {/* Context Window Settings Card */}
          <div className={cn("rounded-xl border px-4 py-4", "border-white/10 bg-white/5")}>
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                  "border-white/10 bg-white/5",
                )}
              >
                <MessageSquare className="h-4 w-4 text-white/50" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className={cn(typography.body.size, "font-medium text-white")}>
                      Context Window
                    </span>
                    <p className="mt-0.5 text-[11px] text-white/45">
                      Number of recent messages to include (1-1000)
                    </p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={manualWindow ?? 50}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      handleManualWindowChange(isNaN(val) ? null : val);
                    }}
                    className={cn(
                      "w-20 rounded-lg border border-white/15 bg-black/30 px-3 py-1.5",
                      "text-center font-mono text-sm text-white",
                      "focus:border-white/30 focus:outline-none",
                      interactive.transition.fast,
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Info Card */}
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
              <strong className="text-white/60">Dynamic Memory</strong> uses AI to automatically
              summarize and manage conversation context, enabling longer, more coherent
              conversations.
            </p>
            <p className="mt-2">
              When disabled, the app uses a simple sliding window of recent messages determined by
              the Context Window setting.
            </p>
          </div>
        </div>
      </section>

      <EmbeddingDownloadPrompt
        isOpen={showDownloadPrompt}
        onClose={() => setShowDownloadPrompt(false)}
      />
    </div>
  );
}
