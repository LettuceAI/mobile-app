import { Download, Brain } from "lucide-react";
import { BottomMenu } from "../../components/BottomMenu";

interface MemorySetupPromptProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onSkip: () => void;
}

export function MemorySetupPrompt({ isOpen, onClose, onConfirm, onSkip }: MemorySetupPromptProps) {
    return (
        <BottomMenu
            isOpen={isOpen}
            onClose={onClose}
            title="Setup Dynamic Memory"
            includeExitIcon={false}
        >
            <div className="space-y-6">
                {/* Icon and Message */}
                <div className="text-center">
                    <div className="mb-4 flex justify-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10">
                            <Brain className="h-8 w-8 text-emerald-400" />
                        </div>
                    </div>
                    <h3 className="text-lg font-semibold text-white">One Last Step</h3>
                    <p className="mt-2 text-sm text-white/60 leading-relaxed max-w-xs mx-auto">
                        To use Dynamic Memory, we need to download a small embedding model (~120MB) to your device.
                    </p>
                </div>

                {/* Info Box */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <ul className="space-y-2 text-xs text-emerald-200/80">
                        <li className="flex items-start gap-2">
                            <span className="mt-0.5">•</span>
                            <span>Model runs 100% offline on your device</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="mt-0.5">•</span>
                            <span>Required for remembering context</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="mt-0.5">•</span>
                            <span>You can disable this later in settings</span>
                        </li>
                    </ul>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    <button
                        onClick={() => {
                            onClose();
                            onConfirm();
                        }}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold h-12 transition-colors"
                    >
                        <Download size={18} />
                        Download & Enable
                    </button>

                    <button
                        onClick={() => {
                            onClose();
                            onSkip();
                        }}
                        className="w-full h-12 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        Enable later (Skip for now)
                    </button>
                </div>
            </div>
        </BottomMenu>
    );
}
