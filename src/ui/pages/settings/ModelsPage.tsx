import { useEffect } from "react";
import { Check, ChevronRight, Cpu } from "lucide-react";
import { useModelsController } from "./hooks/useModelsController";
import { useNavigationManager } from "../../navigation";

export function ModelsPage() {
    const { toNewModel, toEditModel } = useNavigationManager();
    const {
        state: {
            providers,
            models,
            defaultModelId,
        },
    } = useModelsController();

    const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
        <div className="flex h-64 flex-col items-center justify-center">
            <Cpu className="mb-3 h-12 w-12 text-white/20" />
            <h3 className="mb-1 text-lg font-medium text-white">No Models yet</h3>
            <p className="mb-4 text-center text-sm text-white/50">
                Add and manage AI models from different providers
            </p>
            <button
                onClick={onCreate}
                className="rounded-full border border-emerald-400/40 bg-emerald-400/20 px-6 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/30 active:scale-[0.99]"
            >
                Add Model
            </button>
        </div>
    );

    useEffect(() => {
        (window as any).__openAddModel = () => toNewModel();
        const listener = () => toNewModel();
        window.addEventListener("models:add", listener);
        return () => {
            if ((window as any).__openAddModel) {
                delete (window as any).__openAddModel;
            }
            window.removeEventListener("models:add", listener);
        };
    }, [toNewModel]);

    return (
        <div className="flex h-full flex-col">
            {/* List (TopNav handles title/back) */}
            <div className="flex-1 overflow-y-auto mx-3 py-3 space-y-3">
                {models.length === 0 && (
                    <EmptyState
                        onCreate={() => toNewModel()}
                    />
                )}

                {/* Model Cards */}
                {models.map(model => {
                    const isDefault = model.id === defaultModelId;
                    const providerInfo = providers.find(p => p.providerId === model.providerId);
                    return (
                        <button
                            key={model.id}
                            onClick={() => toEditModel(model.id)}
                            className={`group w-full rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${isDefault
                                    ? 'border-emerald-400/30 bg-linear-to-br from-emerald-500/10 to-transparent'
                                    : 'border-white/10 bg-white/3 hover:border-white/15 hover:bg-white/6'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="truncate text-[15px] font-medium text-white">{model.displayName || model.name}</span>
                                        {isDefault && (
                                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                                                <Check className="h-2.5 w-2.5" />
                                                Default
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                        <code className="rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-white/40">{model.name}</code>
                                        <span className="text-white/20">·</span>
                                        <span className="text-[11px] text-white/40">{model.providerLabel || providerInfo?.label}</span>
                                        {model.inputScopes?.includes("image") && (
                                            <>
                                                <span className="text-white/20">·</span>
                                                <span className="rounded-md bg-blue-400/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
                                                    Image In
                                                </span>
                                            </>
                                        )}
                                        {model.outputScopes?.includes("image") && (
                                            <>
                                                <span className="text-white/20">·</span>
                                                <span className="rounded-md bg-blue-400/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
                                                    Image Out
                                                </span>
                                            </>
                                        )}
                                        {model.inputScopes?.includes("audio") && (
                                            <>
                                                <span className="text-white/20">·</span>
                                                <span className="rounded-md bg-purple-400/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
                                                    Audio In
                                                </span>
                                            </>
                                        )}
                                        {model.outputScopes?.includes("audio") && (
                                            <>
                                                <span className="text-white/20">·</span>
                                                <span className="rounded-md bg-purple-400/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
                                                    Audio Out
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-white/20 transition-all group-hover:translate-x-0.5 group-hover:text-white/40" />
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
