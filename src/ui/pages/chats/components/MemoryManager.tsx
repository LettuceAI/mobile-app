import { useState } from "react";
import { Plus, Edit2, Check, Lightbulb, Trash2 } from "lucide-react";
import { cn, radius, typography } from "../../../design-tokens";

interface MemoryManagerProps {
    memories: string[];
    onAdd: (memory: string) => Promise<void>;
    onRemove: (index: number) => Promise<void>;
    onUpdate: (index: number, memory: string) => Promise<void>;
    scrollable?: boolean;
}

export function MemoryManager({
    memories,
    onAdd,
    onRemove,
    onUpdate,
    scrollable = true
}: MemoryManagerProps) {
    const [input, setInput] = useState("");
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingValue, setEditingValue] = useState("");
    const [isAdding, setIsAdding] = useState(false);

    const handleAdd = async () => {
        const trimmed = input.trim();
        if (trimmed.length > 0) {
            setIsAdding(true);
            try {
                await onAdd(trimmed);
                setInput("");
            } finally {
                setIsAdding(false);
            }
        }
    };

    const handleRemove = async (index: number) => {
        await onRemove(index);
    };

    const startEdit = (index: number, currentValue: string) => {
        setEditingIndex(index);
        setEditingValue(currentValue);
    };

    const cancelEdit = () => {
        setEditingIndex(null);
        setEditingValue("");
    };

    const saveEdit = async (index: number) => {
        const trimmed = editingValue.trim();
        if (trimmed.length > 0) {
            await onUpdate(index, trimmed);
            setEditingIndex(null);
            setEditingValue("");
        }
    };

    return (
        <div className={cn("flex flex-col", scrollable ? "h-full max-h-[80vh]" : "h-auto")}>
             {/* Header & Help */}
            <div className="flex-shrink-0 space-y-4 pb-4">
                 <div className={cn(
                    radius.lg,
                    "border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 flex items-start gap-3"
                )}>
                    <Lightbulb className="h-5 w-5 text-emerald-300 shrink-0 mt-0.5" />
                    <span className={cn(typography.caption.size, "text-emerald-200 leading-relaxed")}>
                        Memories are context injected into every message. Keep them concise.
                    </span>
                </div>

                {/* Add Memory Input - Moved to top for better access */}
                <div className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !isAdding) {
                                e.preventDefault();
                                handleAdd();
                            }
                        }}
                        rows={2}
                        className={cn(
                            "w-full resize-none bg-white/5 border border-white/10 text-white placeholder-white/30",
                            radius.lg,
                            "px-4 py-3 pr-12",
                            "focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/20",
                            "transition-all duration-200"
                        )}
                        placeholder="Add a new memory..."
                        disabled={isAdding}
                    />
                    <button
                        onClick={handleAdd}
                        disabled={input.trim().length === 0 || isAdding}
                        className={cn(
                            "absolute right-2 bottom-2 p-2",
                            radius.md,
                            "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
                            "hover:bg-emerald-500/30 active:scale-95",
                            "disabled:opacity-0 disabled:pointer-events-none",
                            "transition-all duration-200"
                        )}
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Scrollable List */}
            <div className={cn(
                "-mx-2 px-2",
                scrollable ? "flex-1 overflow-y-auto min-h-0" : "h-auto"
            )}>
                {memories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                        <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                            <Lightbulb className="h-6 w-6 text-white/50" />
                        </div>
                        <p className="text-sm text-white/60">No memories yet</p>
                    </div>
                ) : (
                    <div className="space-y-3 pb-4">
                        {memories.map((memory, index) => (
                            <div
                                key={index}
                                className={cn(
                                    "group relative",
                                    radius.lg,
                                    "border border-white/10 bg-white/5 overflow-hidden",
                                    "transition-all duration-200"
                                )}
                            >
                                {editingIndex === index ? (
                                    <div className="p-3 space-y-3 bg-black/20">
                                        <textarea
                                            value={editingValue}
                                            onChange={(e) => setEditingValue(e.target.value)}
                                            rows={3}
                                            className="w-full resize-none bg-transparent text-white placeholder-white/30 text-sm focus:outline-none"
                                            placeholder="Enter memory..."
                                            autoFocus
                                        />
                                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                                            <button
                                                onClick={cancelEdit}
                                                className="px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => saveEdit(index)}
                                                disabled={editingValue.trim().length === 0}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/30 transition-colors"
                                            >
                                                <Check className="h-3 w-3" />
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-start p-4 gap-4">
                                        <p className="flex-1 text-sm text-white/90 leading-relaxed break-words">
                                            {memory}
                                        </p>
                                        <div className="flex flex-col gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => startEdit(index, memory)}
                                                className="p-2 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleRemove(index)}
                                                className="p-2 rounded-md hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
