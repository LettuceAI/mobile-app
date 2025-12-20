import { Brain, Edit3, Check, Loader, ArrowRight } from "lucide-react";
import { cn, radius, typography } from "../../../design-tokens";
import { getPlatform } from "../../../../core/utils/platform";
import { MemorySetupPrompt } from "../MemorySetupPrompt";
import type { MemoryType } from "../hooks/onboardingReducer";

interface MemoryStepProps {
    selectedType: MemoryType | null;
    isProcessing: boolean;
    showDownloadModal: boolean;
    onSelectType: (type: MemoryType) => void;
    onFinish: () => void;
    onCloseModal: () => void;
    onConfirmDownload: () => void;
    onSkipDownload: () => void;
}

export function MemoryStep({
    selectedType,
    isProcessing,
    showDownloadModal,
    onSelectType,
    onFinish,
    onCloseModal,
    onConfirmDownload,
    onSkipDownload,
}: MemoryStepProps) {
    const platform = getPlatform();
    const isDesktop = platform.type === "desktop";

    // Memory Card Components
    const DynamicMemoryCard = ({ compact = false }: { compact?: boolean }) => (
        <button
            onClick={() => onSelectType("dynamic")}
            className={cn(
                "w-full h-full flex flex-col text-left relative overflow-hidden group transition-all duration-300",
                radius.lg,
                "border p-1",
                selectedType === "dynamic"
                    ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
            )}
        >
            <div className={cn("absolute inset-0 bg-linear-to-br from-emerald-500/10 via-transparent to-transparent opacity-0 transition-opacity duration-500", selectedType === "dynamic" ? "opacity-100" : "group-hover:opacity-30")} />

            <div className={cn("relative z-10", compact ? "p-4" : "p-5")}>
                <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center border transition-colors duration-300",
                            selectedType === "dynamic"
                                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                                : "bg-white/10 border-white/10 text-gray-400 group-hover:text-emerald-300"
                        )}>
                            <Brain size={20} />
                        </div>
                        <div>
                            <h3 className={cn("font-semibold text-white", compact ? "text-base" : "text-lg")}>Dynamic Memory</h3>
                            <div className="flex items-center gap-1.5 mt-0.5 h-5">
                                <span className="text-[10px] uppercase tracking-wider font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                    Recommended
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className={cn(
                        "w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-300",
                        selectedType === "dynamic"
                            ? "bg-emerald-500 border-emerald-500 text-black scale-100"
                            : "border-white/20 bg-transparent text-transparent scale-90"
                    )}>
                        <Check size={14} strokeWidth={3} />
                    </div>
                </div>

                <p className={cn("text-gray-400 mb-4 leading-relaxed pl-[52px]", compact ? "text-xs" : "text-sm")}>
                    Uses a <b>local embedding model</b> to smartly manage context. This cuts token costs while maintaining high quality, even in long chats.
                </p>

                <div className={cn("grid gap-2 pl-[52px]", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
                    <div className="flex items-center gap-2 text-xs text-gray-300">
                        <div className="w-1 h-1 rounded-full bg-emerald-500" />
                        Maintains quality in long chats
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-300">
                        <div className="w-1 h-1 rounded-full bg-emerald-500" />
                        Reduces API costs significantly
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-300">
                        <div className="w-1 h-1 rounded-full bg-emerald-500" />
                        Automatic context management
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-300">
                        <div className="w-1 h-1 rounded-full bg-emerald-500" />
                        Zero configuration needed
                    </div>
                </div>
            </div>
        </button>
    );

    const ManualMemoryCard = ({ compact = false }: { compact?: boolean }) => (
        <button
            onClick={() => onSelectType("manual")}
            className={cn(
                "w-full h-full flex flex-col text-left relative overflow-hidden group transition-all duration-300",
                radius.lg,
                "border p-1",
                selectedType === "manual"
                    ? "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
            )}
        >
            <div className={cn("absolute inset-0 bg-linear-to-br from-blue-500/10 via-transparent to-transparent opacity-0 transition-opacity duration-500", selectedType === "manual" ? "opacity-100" : "group-hover:opacity-30")} />

            <div className={cn("relative z-10", compact ? "p-4" : "p-5")}>
                <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center border transition-colors duration-300",
                            selectedType === "manual"
                                ? "bg-blue-500/20 border-blue-500/30 text-blue-400"
                                : "bg-white/10 border-white/10 text-gray-400 group-hover:text-blue-300"
                        )}>
                            <Edit3 size={20} />
                        </div>
                        <div>
                            <h3 className={cn("font-semibold text-white", compact ? "text-base" : "text-lg")}>Manual Memory</h3>
                            <p className="text-xs text-gray-500 mt-0.5 h-5 flex items-center">Classic experience</p>
                        </div>
                    </div>
                    <div className={cn(
                        "w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-300",
                        selectedType === "manual"
                            ? "bg-blue-500 border-blue-500 text-black scale-100"
                            : "border-white/20 bg-transparent text-transparent scale-90"
                    )}>
                        <Check size={14} strokeWidth={3} />
                    </div>
                </div>

                <p className={cn("text-gray-400 mb-4 leading-relaxed pl-[52px]", compact ? "text-xs" : "text-sm")}>
                    You explicitly pin messages and edit the "World Info" or character definitions yourself. Good for total control.
                </p>

                <div className={cn("grid gap-2 pl-[52px]", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
                    <div className="flex items-center gap-2 text-xs text-gray-300">
                        <div className="w-1 h-1 rounded-full bg-blue-500" />
                        Total control over facts
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-300">
                        <div className="w-1 h-1 rounded-full bg-blue-500" />
                        Best for specific scenarios
                    </div>
                </div>
            </div>
        </button>
    );

    const FinishButton = () => (
        <button
            onClick={onFinish}
            disabled={!selectedType || isProcessing}
            className={cn(
                "w-full h-14 rounded-2xl font-bold text-lg transition-all duration-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-3 group relative overflow-hidden",
                selectedType === "dynamic"
                    ? "bg-emerald-500 text-black shadow-[0_4px_20px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_24px_rgba(16,185,129,0.4)] hover:bg-emerald-400"
                    : selectedType === "manual"
                        ? "bg-blue-500 text-black shadow-[0_4px_20px_rgba(59,130,246,0.25)] hover:shadow-[0_4px_24px_rgba(59,130,246,0.4)] hover:bg-blue-400"
                        : "bg-white/5 text-gray-500 border border-white/5"
            )}
        >
            {isProcessing ? (
                <>
                    <Loader size={20} className="animate-spin" />
                    <span>Setting up...</span>
                </>
            ) : (
                <>
                    <span>Finish Setup</span>
                    {selectedType && (
                        <ArrowRight
                            size={20}
                            className="transition-transform duration-300 group-hover:translate-x-1"
                        />
                    )}
                </>
            )}
        </button>
    );

    // Desktop Layout
    if (isDesktop) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
                <div className="w-full max-w-4xl">
                    {/* Title */}
                    <div className="text-center space-y-3 mb-10">
                        <h1 className="text-2xl font-bold text-white">Choose your memory style</h1>
                        <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
                            How should your AI companions remember details about you and your conversations?
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-8">
                        <DynamicMemoryCard compact />
                        <ManualMemoryCard compact />
                    </div>

                    <div className="max-w-md mx-auto">
                        <FinishButton />
                    </div>
                </div>

                {/* Download Modal */}
                <MemorySetupPrompt
                    isOpen={showDownloadModal}
                    onClose={onCloseModal}
                    onConfirm={onConfirmDownload}
                    onSkip={onSkipDownload}
                />
            </div>
        );
    }

    // Mobile Layout
    return (
        <>
            <div className="flex flex-col items-center max-w-md mx-auto w-full pb-8">
                {/* Title */}
                <div className="text-center space-y-3 mb-10">
                    <h1 className={cn(typography.h3.size, typography.h3.weight, "text-white")}>Choose your memory style</h1>
                    <p className="text-sm text-gray-400 max-w-xs mx-auto leading-relaxed">
                        How should your AI companions remember details about you and your conversations?
                    </p>
                </div>

                {/* Comparison Cards - Stacked */}
                <div className="w-full space-y-4 mb-8">
                    <DynamicMemoryCard />
                    <ManualMemoryCard />
                </div>

                {/* Action Button */}
                <FinishButton />
            </div>

            {/* Download Modal */}
            <MemorySetupPrompt
                isOpen={showDownloadModal}
                onClose={onCloseModal}
                onConfirm={onConfirmDownload}
                onSkip={onSkipDownload}
            />
        </>
    );
}
