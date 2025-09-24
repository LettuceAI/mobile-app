import { useState } from "react";
import { Shield, Lock, Database } from "lucide-react";

export function SecurityPage() {
    const [isPureModeEnabled, setIsPureModeEnabled] = useState(true);

    return (
        <div className="flex h-full flex-col pb-16">
            <section className="flex-1 overflow-y-auto px-3 pt-3 space-y-6">
                {/* Section: Content Filtering */}
                <div>
                    <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">Content Filtering</h2>
                    <div className={`relative overflow-hidden rounded-xl border px-4 py-3 transition-all duration-300 ${
                        isPureModeEnabled 
                            ? 'border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 via-white/5 to-white/5 shadow-[0_0_20px_rgba(16,185,129,0.15)]' 
                            : 'border-white/10 bg-white/5'
                    }`}>
                        {/* Subtle inner glow when enabled */}
                        {isPureModeEnabled && (
                            <div 
                                className="pointer-events-none absolute inset-0 opacity-60"
                                style={{
                                    background: 'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.08) 0%, transparent 50%)'
                                }}
                            />
                        )}
                        
                        <div className="relative flex items-start gap-3">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-300 ${
                                isPureModeEnabled 
                                    ? 'border-emerald-400/40 bg-emerald-500/15 shadow-lg shadow-emerald-500/25' 
                                    : 'border-white/10 bg-white/10'
                            }`}>
                                <Shield className={`h-4 w-4 transition-colors duration-300 ${
                                    isPureModeEnabled ? 'text-emerald-200' : 'text-white/70'
                                }`} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-white">Pure Mode</span>
                                            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none uppercase tracking-[0.25em] transition-all duration-300 ${isPureModeEnabled
                                                ? 'border-emerald-400/50 bg-emerald-500/25 text-emerald-100 shadow-sm shadow-emerald-500/30'
                                                : 'border-orange-400/40 bg-orange-500/20 text-orange-200'
                                                }`}>
                                                {isPureModeEnabled ? 'On' : 'Off'}
                                            </span>
                                        </div>
                                        <div className="mt-0.5 text-[11px] text-white/50">
                                            {isPureModeEnabled ? 'NSFW content blocked' : 'All content allowed'}
                                        </div>
                                    </div>
                                    <div className="flex items-center">
                                        <input
                                            id="pure-mode"
                                            type="checkbox"
                                            checked={isPureModeEnabled}
                                            onChange={() => setIsPureModeEnabled(v => !v)}
                                            className="peer sr-only"
                                        />
                                        <label
                                            htmlFor="pure-mode"
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-400/40 ${
                                                isPureModeEnabled 
                                                    ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' 
                                                    : 'bg-white/20'
                                            }`}
                                        >
                                            <span
                                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                    isPureModeEnabled ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </label>
                                    </div>
                                </div>
                                <div className="mt-2 text-[11px] text-white/45 leading-relaxed">
                                    Restrict adult content in AI responses
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section: Data Protection */}
                <div>
                    <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">Data Protection</h2>
                    <div className="space-y-2">
                        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                            <div className="flex items-start gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10">
                                    <Database className="h-4 w-4 text-white/70" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-white">Local Storage</span>
                                        <span className="rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white/70">
                                            Private
                                        </span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white/45 leading-relaxed">
                                        Data stays on your device, no cloud sync
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                            <div className="flex items-start gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10">
                                    <Lock className="h-4 w-4 text-white/70" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-white">API Keys</span>
                                        <span className="rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white/70">
                                            Encrypted
                                        </span>
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white/45 leading-relaxed">
                                        Encrypted storage, only used for AI authentication
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}