import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Cpu, EthernetPort, Shield, RotateCcw, BookOpen, User, Sparkles, Github, BarChart3, FileText, Wrench, MessageCircle, ScrollText, Sliders } from "lucide-react";
import { typography, radius, spacing, interactive, cn } from "../../design-tokens";
import { useSettingsSummary } from "./hooks/useSettingsSummary";
import { isDevelopmentMode } from "../../../core/utils/env";
import { invoke } from "@tauri-apps/api/core";
import { DISCORD_SERVER_LINK, GITHUB_REPO_LINK } from "../../../core/utils/links";

interface RowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  count?: number | null;
  tone?: 'default' | 'danger' | 'guide';
}

function Row({ icon, title, subtitle, onClick, count, tone = 'default' }: RowProps) {
  const toneStyles = {
    danger: 'border-red-400/30 bg-red-400/10 group-hover:border-red-400/50',
    guide: 'border-blue-400/30 bg-blue-400/10 group-hover:border-blue-400/50',
    default: 'border-white/10 bg-white/10 group-hover:border-white/20'
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full px-4 py-3 text-left",
        radius.md,
        "border border-white/10 bg-white/5",
        interactive.transition.default,
        "hover:border-white/20 hover:bg-white/[0.08]",
        interactive.active.scale,
        interactive.focus.ring
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center",
          radius.full,
          "border text-white/70",
          interactive.transition.default,
          toneStyles[tone]
        )}>
          <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn(
              "truncate",
              typography.body.size,
              typography.body.weight,
              "text-white"
            )}>
              {title}
            </span>
            {typeof count === 'number' && (
              <span className={cn(
                "px-1.5 py-0.5",
                radius.sm,
                "border border-white/10 bg-white/10",
                typography.caption.size,
                typography.caption.weight,
                "leading-none text-white/70"
              )}>
                {count}
              </span>
            )}
          </div>
          {subtitle && (
            <div className={cn(
              "mt-0.5 line-clamp-1",
              typography.caption.size,
              "text-white/45"
            )}>
              {subtitle}
            </div>
          )}
        </div>
        <ChevronRight className={cn(
          "h-4 w-4 shrink-0 text-white/30",
          "transition-colors group-hover:text-white/60"
        )} />
      </div>
    </button>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const {
    state: { providers, models, characterCount, personaCount, isLoading },
  } = useSettingsSummary();
  const [version, setVersion] = useState<string>('unknown');

  const appVersion: () => Promise<string> = useCallback(async () => {
    try {
      const appversion = await invoke("get_app_version");
      return appversion as string;
    } catch (error) {
      console.error("Failed to get app version:", error);
      return "unknown";
    }
  }, []);

  useEffect(() => {
    (async () => {
      setVersion(await appVersion());
    })();
  }, [appVersion]);

  const providerCount = providers.length;
  const modelCount = models.length;
  const items = useMemo(() => ([
    {
      key: 'providers',
      icon: <EthernetPort />,
      title: 'Providers',
      subtitle: 'API credentials & endpoints',
      count: providerCount,
      onClick: () => navigate('/settings/providers')
    },
    {
      key: 'models',
      icon: <Cpu />,
      title: 'Models',
      subtitle: 'Manage AI model catalog',
      count: modelCount,
      onClick: () => navigate('/settings/models')
    },
    /*{
      key: 'characters',
      icon: <Sparkles />,
      title: 'Characters',
      subtitle: 'Manage AI characters',
      count: characterCount,
      onClick: () => navigate('/settings/characters')
    },*/
    /*{
      key: 'personas',
      icon: <User />,
      title: 'Personas',
      subtitle: 'Manage user personas',
      count: personaCount,
      onClick: () => navigate('/settings/personas')
    },*/
    {
      key: 'prompts',
      icon: <FileText />,
      title: 'System Prompts',
      subtitle: 'Customize AI behavior',
      onClick: () => navigate('/settings/prompts')
    },
    {
      key: 'security',
      icon: <Shield />,
      title: 'Security',
      subtitle: 'Privacy & data protection',
      onClick: () => navigate('/settings/security')
    },
    {
      key: 'usage',
      icon: <BarChart3 />,
      title: 'Usage Analytics',
      subtitle: 'Track costs and token usage',
      onClick: () => navigate('/settings/usage')
    },
    {
      key: 'advanced',
      icon: <Sliders />,
      title: 'Advanced',
      subtitle: 'AI features & memory settings',
      onClick: () => navigate('/settings/advanced')
    },
    {
      key: 'guide',
      icon: <BookOpen />,
      title: 'Setup Guide',
      subtitle: 'Rerun onboarding flow',
      tone: 'guide' as const,
      onClick: () => navigate('/welcome')
    },
    {
      key: 'github',
      icon: <Github />,
      title: 'Report Issues',
      subtitle: `GitHub repository & feedback • v${version}`,
      onClick: async () => {
        try {
          const { openUrl } = await import('@tauri-apps/plugin-opener');
          await openUrl(`${GITHUB_REPO_LINK}/issues`);
        } catch (error) {
          console.error('Failed to open URL:', error);
          window.open(`${GITHUB_REPO_LINK}/issues`, '_blank');
        }
      }
    },
    {
      key: 'discord',
      icon: <MessageCircle />,
      title: 'Join Discord',
      subtitle: 'Community support & discussions',
      onClick: async () => {
        try {
          const { openUrl } = await import('@tauri-apps/plugin-opener');
          await openUrl(DISCORD_SERVER_LINK);
        } catch (error) {
          console.error('Failed to open URL:', error);
          window.open(DISCORD_SERVER_LINK, '_blank');
        }
      }
    },
    {
      key: 'changelog',
      icon: <ScrollText />,
      title: 'Changelog',
      subtitle: `Release notes & version history`,
      onClick: () => navigate('/settings/changelog')
    },
    {
      key: 'reset',
      icon: <RotateCcw />,
      title: 'Reset',
      subtitle: 'Clear all app data',
      tone: 'danger' as const,
      onClick: () => navigate('/settings/reset')
    },
    ...(isDevelopmentMode() ? [{
      key: 'developer',
      icon: <Wrench />,
      title: 'Developer Tools',
      subtitle: 'Test data generators & debug info',
      tone: 'default' as const,
      onClick: () => navigate('/settings/developer')
    }] : [])
  ]), [providerCount, modelCount, characterCount, navigate]);

  return (
    <div className="flex h-full flex-col pb-16 text-gray-200">
      <section className={cn("flex-1 overflow-y-auto px-1 pt-4", spacing.section)}>
        {/* Section: Core */}
        <div>
          <h2 className={cn(
            "mb-2 px-1",
            typography.overline.size,
            typography.overline.weight,
            typography.overline.tracking,
            typography.overline.transform,
            "text-white/35"
          )}>
            Core
          </h2>
          <div className={spacing.field}>
            {items.filter(i => ['providers', 'models', 'characters', 'personas', 'prompts', 'security', 'usage', 'advanced'].includes(i.key)).map(item => (
              <Row key={item.key} icon={item.icon} title={item.title} subtitle={item.subtitle} count={item.count as number | undefined} onClick={item.onClick} />
            ))}
          </div>
        </div>

        {/* Section: Assistance */}
        <div>
          <h2 className={cn(
            "mb-2 px-1",
            typography.overline.size,
            typography.overline.weight,
            typography.overline.tracking,
            typography.overline.transform,
            "text-white/35"
          )}>
            Assistance
          </h2>
          <div className={spacing.field}>
            {items.filter(i => ['guide'].includes(i.key)).map(item => (
              <Row key={item.key} icon={item.icon} title={item.title} subtitle={item.subtitle} onClick={item.onClick} tone={item.tone} />
            ))}
          </div>
        </div>

        {/* Section: Info */}
        <div>
          <h2 className={cn(
            "mb-2 px-1",
            typography.overline.size,
            typography.overline.weight,
            typography.overline.tracking,
            typography.overline.transform,
            "text-white/35"
          )}>
            Info
          </h2>
          <div className={spacing.field}>
            {items.filter(i => ['github', 'discord', 'changelog'].includes(i.key)).map(item => (
              <Row key={item.key} icon={item.icon} title={item.title} subtitle={item.subtitle} onClick={item.onClick} />
            ))}
          </div>
        </div>

        {/* Section: Danger */}
        <div>
          <h2 className={cn(
            "mb-2 px-1",
            typography.overline.size,
            typography.overline.weight,
            typography.overline.tracking,
            typography.overline.transform,
            "text-white/35"
          )}>
            Danger Zone
          </h2>
          <div className={spacing.field}>
            {items.filter(i => ['reset'].includes(i.key)).map(item => (
              <Row key={item.key} icon={item.icon} title={item.title} subtitle={item.subtitle} onClick={item.onClick} tone={item.tone} />
            ))}
          </div>
        </div>

        {/* Section: Developer (only in dev mode) */}
        {isDevelopmentMode() && (
          <div>
            <h2 className={cn(
              "mb-2 px-1",
              typography.overline.size,
              typography.overline.weight,
              typography.overline.tracking,
              typography.overline.transform,
              "text-white/35"
            )}>
              Developer
            </h2>
            <div className={spacing.field}>
              {items.filter(i => ['developer'].includes(i.key)).map(item => (
                <Row key={item.key} icon={item.icon} title={item.title} subtitle={item.subtitle} onClick={item.onClick} tone={item.tone} />
              ))}
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="pointer-events-none absolute inset-x-0 top-0 px-4 pt-4">
            <div className={spacing.field}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={cn("h-[52px] w-full animate-pulse", radius.md, "bg-white/5")} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
