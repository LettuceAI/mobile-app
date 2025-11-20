import { Download } from "lucide-react";
import { BottomMenu } from "../../ui/components/BottomMenu";
import { useNavigate } from "react-router-dom";

interface EmbeddingDownloadPromptProps {
    isOpen: boolean;
    onClose: () => void;
}

export function EmbeddingDownloadPrompt({ isOpen, onClose }: EmbeddingDownloadPromptProps) {
    const navigate = useNavigate();

    const handleDownload = () => {
        onClose();
        navigate("/settings/embedding-download");
    };

    const handleCancel = () => {
        onClose();
    };

    return (
        <BottomMenu
            isOpen={isOpen}
            onClose={onClose}
            title="Download Required"
            includeExitIcon={false}
        >
            <div className="space-y-4">
                {/* Icon and Message */}
                <div className="text-center">
                    <div className="mb-4 flex justify-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-blue-400/20 bg-blue-500/10">
                            <Download className="h-8 w-8 text-blue-400" />
                        </div>
                    </div>
                    <h3 className="text-lg font-semibold text-white">Embedding Model Required</h3>
                    <p className="mt-2 text-sm text-white/60">
                        Dynamic Memory requires downloading a local embedding model (~260 MB) to function.
                    </p>
                </div>

                {/* Info Box */}
                <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-3">
                    <ul className="space-y-1 text-xs text-blue-200/80">
                        <li>• Model will be stored locally on your device</li>
                        <li>• Download size: approximately 260 MB</li>
                        <li>• Required for conversation summarization</li>
                    </ul>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={handleCancel}
                        className="flex-1 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/10"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDownload}
                        className="flex-1 rounded-full border border-blue-400/50 bg-blue-500/20 px-6 py-3 text-sm font-medium text-blue-100 transition hover:border-blue-300 hover:bg-blue-500/30"
                    >
                        Download
                    </button>
                </div>
            </div>
        </BottomMenu>
    );
}
