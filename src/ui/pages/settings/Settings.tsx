import { useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { ChevronRight, Cpu, Key, Shield, RotateCcw, BookOpen, User } from "lucide-react";
import { readSettings } from "../../../core/storage/repo";
import type { ProviderCredential, Model } from "../../../core/storage/schemas";





interface RowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  count?: number | null;
  tone?: 'default' | 'danger' | 'guide';
}

function Row({ icon, title, subtitle, onClick, count, tone = 'default' }: RowProps) {
  return (
    <button
      onClick={onClick}
      className="group w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-white/20"
    >
      <div className="flex items-center gap-3">
        <div
          className={`
            flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-white/70 transition
            ${tone === 'danger' ? 'border-red-400/30 bg-red-500/10 group-hover:border-red-400/50' : ''}
            ${tone === 'guide' ? 'border-indigo-400/30 bg-indigo-500/10 group-hover:border-indigo-400/50' : ''}
            ${tone === 'default' ? 'border-white/10 bg-white/10 group-hover:border-white/20' : ''}
          `}
        >
          <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-white">{title}</span>
            {typeof count === 'number' && (
              <span className="rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white/70">
                {count}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="mt-0.5 line-clamp-1 text-[11px] text-white/45">
              {subtitle}
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/30 transition group-hover:text-white/60" />
      </div>
    </button>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await readSettings();
      setProviders(settings.providerCredentials);
      setModels(settings.models);
    } finally {
      setIsLoading(false);
    }
  };

  const providerCount = providers.length;
  const modelCount = models.length;
  const items = useMemo(() => ([
    {
      key: 'providers',
      icon: <Key />,
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
    {
      key: 'personas',
      icon: <User />,
      title: 'Personas',
      subtitle: 'Manage user personas',
      onClick: () => navigate('/personas')
    },
    {
      key: 'security',
      icon: <Shield />,
      title: 'Security',
      subtitle: 'Privacy & data protection',
      onClick: () => navigate('/settings/security')
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
      key: 'reset',
      icon: <RotateCcw />,
      title: 'Reset',
      subtitle: 'Clear all app data',
      tone: 'danger' as const,
      onClick: () => navigate('/settings/reset')
    }
  ]), [providerCount, modelCount, navigate]);



  return (
    <>
      <div className="flex h-full flex-col pb-16 text-gray-200">
        <section className="flex-1 overflow-y-auto px-3 pt-3 space-y-6">
          {/* Section: Core */}
          <div>
            <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">Core</h2>
            <div className="space-y-2">
              {items.filter(i => ['providers','models','personas','security'].includes(i.key)).map(item => (
                <Row key={item.key} icon={item.icon} title={item.title} subtitle={item.subtitle} count={item.count as number | undefined} onClick={item.onClick} />
              ))}
            </div>
          </div>
          {/* Section: Assistance */}
          <div>
            <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">Assistance</h2>
            <div className="space-y-2">
              {items.filter(i => ['guide'].includes(i.key)).map(item => (
                <Row key={item.key} icon={item.icon} title={item.title} subtitle={item.subtitle} onClick={item.onClick} tone={item.tone} />
              ))}
            </div>
          </div>
          {/* Section: Danger */}
            <div>
              <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">Danger Zone</h2>
              <div className="space-y-2">
                {items.filter(i => ['reset'].includes(i.key)).map(item => (
                  <Row key={item.key} icon={item.icon} title={item.title} subtitle={item.subtitle} onClick={item.onClick} tone={item.tone} />
                ))}
              </div>
            </div>
          {/* Loading overlay (minimal) */}
          {isLoading && (
            <div className="pointer-events-none absolute inset-x-0 top-0 px-3 pt-3">
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 w-full animate-pulse rounded-xl bg-white/5" />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
