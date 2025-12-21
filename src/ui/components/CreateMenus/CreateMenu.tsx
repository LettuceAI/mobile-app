import { Brain, User, BookOpen, Loader2 } from "lucide-react";
import { BottomMenu, MenuButton, MenuSection } from "../BottomMenu";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { saveLorebook } from "../../../core/storage/repo";

export function CreateMenu({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const navigate = useNavigate();
    const [mode, setMode] = useState<'menu' | 'lorebook-name'>('menu');
    const [lorebookName, setLorebookName] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const handleClose = () => {
        onClose();
        // Reset state after animation
        setTimeout(() => {
            setMode('menu');
            setLorebookName("");
            setIsCreating(false);
        }, 300);
    };

    const handleCreateLorebook = async () => {
        if (!lorebookName.trim()) return;

        try {
            setIsCreating(true);
            const newLorebook = await saveLorebook({ name: lorebookName.trim() });
            navigate(`/library/lorebooks/${newLorebook.id}`);
            handleClose();
        } catch (error) {
            console.error("Failed to create lorebook:", error);
            setIsCreating(false);
        }
    };

    return (
        <BottomMenu
            isOpen={isOpen}
            onClose={handleClose}
            title={mode === 'menu' ? "Create New" : "Name Lorebook"}
            includeExitIcon={false}
            location="bottom"
        >
            {mode === 'menu' ? (
                <MenuSection>
                    <MenuButton
                        icon={User}
                        title="Create Character"
                        description="Design a unique AI character with personality traits"
                        color="from-blue-500 to-blue-600"
                        onClick={() => {
                            onClose();
                            navigate("/create/character");
                        }}
                    />

                    <MenuButton
                        icon={Brain}
                        title="Create Persona"
                        description="Define a reusable writing style or personality"
                        color="from-purple-500 to-purple-600"
                        onClick={() => {
                            onClose();
                            navigate("/create/persona");
                        }}
                    />

                    <MenuButton
                        icon={BookOpen}
                        title="Create Lorebook"
                        description="Build a world bible or knowledge base"
                        color="from-amber-500 to-amber-600"
                        onClick={() => setMode('lorebook-name')}
                    />
                </MenuSection>
            ) : (
                <div className="space-y-4">
                    <input
                        value={lorebookName}
                        onChange={(e) => setLorebookName(e.target.value)}
                        placeholder="Enter lorebook name..."
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white placeholder-white/40 transition focus:border-white/25 focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateLorebook();
                        }}
                    />
                    <div className="flex gap-3">
                        <button
                            onClick={() => setMode('menu')}
                            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleCreateLorebook}
                            disabled={isCreating || !lorebookName.trim()}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/20 py-3 text-sm font-medium text-emerald-100 transition hover:border-emerald-500/50 hover:bg-emerald-500/30 disabled:opacity-50"
                        >
                            {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isCreating ? "Creating..." : "Create"}
                        </button>
                    </div>
                </div>
            )}
        </BottomMenu>
    );
}
