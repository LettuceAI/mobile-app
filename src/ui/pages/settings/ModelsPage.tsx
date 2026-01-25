import { useState, useEffect } from "react";
import { Check, ChevronRight, EthernetPort, Edit3, Trash2, Star, StarOff } from "lucide-react";
import { BottomMenu, MenuButton } from "../../components/BottomMenu";
import { getProviderIcon } from "../../../core/utils/providerIcons";
import { useModelsController } from "./hooks/useModelsController";
import { useNavigationManager } from "../../navigation";

export function ModelsPage() {
  const [selectedModel, setSelectedModel] = useState<any | null>(null);
  const { toNewModel, toEditModel } = useNavigationManager();
  const {
    state: { providers, models, defaultModelId },
    handleSetDefault,
    handleDelete,
  } = useModelsController();

  const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
    <div className="flex h-64 flex-col items-center justify-center">
      <EthernetPort className="mb-3 h-12 w-12 text-white/20" />
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
        {models.length === 0 && <EmptyState onCreate={() => toNewModel()} />}

        {/* Model Cards */}
        {models.map((model) => {
          const isDefault = model.id === defaultModelId;
          const providerInfo = providers.find((p) => p.providerId === model.providerId);
          return (
            <button
              key={model.id}
              onClick={() => setSelectedModel(model)}
              className="group w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                {getProviderIcon(model.providerId)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">
                      {model.displayName || model.name}
                    </span>
                    {isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                        <Check className="h-2.5 w-2.5" />
                        Default
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-white/50">
                    <span className="truncate">
                      {model.providerLabel || providerInfo?.label || model.providerId}
                    </span>
                    <span className="opacity-40">•</span>
                    <span className="truncate max-w-37.5 font-mono text-[10px]">{model.name}</span>

                    {(model.inputScopes?.includes("image") ||
                      model.outputScopes?.includes("image")) && (
                      <>
                        <span className="opacity-40">•</span>
                        <span className="text-blue-300">Vision</span>
                      </>
                    )}

                    {(model.inputScopes?.includes("audio") ||
                      model.outputScopes?.includes("audio")) && (
                      <>
                        <span className="opacity-40">•</span>
                        <span className="text-purple-300">Audio</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/60 transition" />
              </div>
            </button>
          );
        })}
      </div>

      <BottomMenu
        isOpen={!!selectedModel}
        onClose={() => setSelectedModel(null)}
        title={selectedModel?.displayName || selectedModel?.name || "Model"}
      >
        {selectedModel && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-white">
                  {selectedModel.displayName || selectedModel.name}
                </span>
                {selectedModel.id === defaultModelId && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                    Default
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-white/50">{selectedModel.name}</p>
            </div>

            <MenuButton
              icon={Edit3}
              title="Edit"
              description="Configure model parameters"
              onClick={() => {
                toEditModel(selectedModel.id);
                setSelectedModel(null);
              }}
              color="from-indigo-500 to-blue-600"
            />

            <MenuButton
              icon={selectedModel.id === defaultModelId ? StarOff : Star}
              title={selectedModel.id === defaultModelId ? "Already Default" : "Set as Default"}
              description="Make this your primary model"
              disabled={selectedModel.id === defaultModelId}
              onClick={() => {
                void handleSetDefault(selectedModel.id);
                setSelectedModel(null);
              }}
              color="from-emerald-500 to-emerald-600"
            />

            <MenuButton
              icon={Trash2}
              title="Delete"
              description="Remove this model permanently"
              onClick={() => {
                if (
                  confirm(
                    `Are you sure you want to delete ${selectedModel.displayName || selectedModel.name}?`,
                  )
                ) {
                  void handleDelete(selectedModel.id);
                  setSelectedModel(null);
                }
              }}
              color="from-rose-500 to-red-600"
            />
          </div>
        )}
      </BottomMenu>
    </div>
  );
}
