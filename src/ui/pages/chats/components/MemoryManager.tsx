import { useState } from "react";
import { Plus, X, Edit2, Check, Lightbulb } from "lucide-react";
import { cn, radius, typography, spacing, interactive } from "../../../design-tokens";

interface MemoryManagerProps {
    memories: string[];
    onAdd: (memory: string) => Promise<void>;
    onRemove: (index: number) => Promise<void>;
    onUpdate: (index: number, memory: string) => Promise<void>;
}

export function MemoryManager({
    memories,
    onAdd,
    onRemove,
    onUpdate
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
        <div className="space-y-4">
            {/* Memory Count Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className={cn(typography.body.size, typography.h3.weight, "text-white")}>
                        Memories ({memories.length})
                    </h3>
                    <p className={cn(typography.caption.size, "text-gray-400 mt-0.5")}>
                        Key facts the AI should remember
                    </p>
                </div>
            </div>

            {/* Memory List */}
            {memories.length > 0 && (
                <div className={spacing.field}>
                    {memories.map((memory, index) => (
                        <div
                            key={index}
                            className={cn(
                                radius.lg,
                                "border border-white/10 bg-white/5 p-3"
                            )}
                        >
                            {editingIndex === index ? (
                                /* Edit Mode */
                                <div className="space-y-2">
                                    <textarea
                                        value={editingValue}
                                        onChange={(e) => setEditingValue(e.target.value)}
                                        rows={2}
                                        className="w-full resize-none rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                                        placeholder="Enter memory..."
                                        autoFocus
                                    />
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={cancelEdit}
                                            className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-medium text-white/70 transition hover:bg-white/10"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => saveEdit(index)}
                                            disabled={editingValue.trim().length === 0}
                                            className="flex h-7 items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Check className="h-3 w-3" />
                                            Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* View Mode */
                                <div className="flex items-start gap-3">
                                    <p className={cn(
                                        typography.bodySmall.size,
                                        "flex-1 text-white/90 leading-relaxed"
                                    )}>
                                        {memory}
                                    </p>
                                    <div className="flex shrink-0 gap-1">
                                        <button
                                            onClick={() => startEdit(index, memory)}
                                            className={cn(
                                                "relative flex items-center justify-center",
                                                radius.md,
                                                "border border-white/10 bg-white/5 text-white/60",
                                                "transition hover:border-white/20 hover:bg-white/10 hover:text-white",
                                                interactive.active.scale,
                                                "z-10"
                                            )}
                                            aria-label="Edit memory"
                                        >
                                            <Edit2 className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleRemove(index)}
                                            className={cn(
                                                "relative flex items-center justify-center",
                                                radius.md,
                                                "border border-red-500/30 bg-red-500/10 text-red-400",
                                                "transition hover:border-red-500/50 hover:bg-red-500/20",
                                                interactive.active.scale,
                                                "z-10"
                                            )}
                                            aria-label="Remove memory"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Empty State */}
            {memories.length === 0 && (
                <div className={cn(
                    radius.lg,
                    "border border-white/10 bg-white/5 px-6 py-8 text-center"
                )}>
                    <p className={cn(typography.bodySmall.size, "text-gray-400")}>
                        No memories yet. Add important facts you want the AI to remember.
                    </p>
                </div>
            )}

            {/* Add Memory Input */}
            <div className={cn(
                radius.lg,
                "border border-white/10 bg-[#0c0d13]/85 p-4 space-y-3"
            )}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !isAdding) {
                            e.preventDefault();
                            handleAdd();
                        }
                    }}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                    placeholder="Add a new memory..."
                    disabled={isAdding}
                />
                <div className="flex items-center justify-end">
                    <button
                        onClick={handleAdd}
                        disabled={input.trim().length === 0 || isAdding}
                        className={cn(
                            "flex items-center gap-2 rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-200 transition",
                            "hover:bg-emerald-500/30 active:scale-[0.98]",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                    >
                        <Plus className="h-4 w-4" />
                        Add Memory
                    </button>
                </div>
            </div>

            {/* Help Text */}
            <div className={cn(
                radius.lg,
                "border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 flex items-center gap-2"
            )}>
                <span className="flex items-center justify-center h-7 w-7 px-2 rounded-full bg-emerald-500/20 text-emerald-300">
                    <Lightbulb className="h-4 w-4" />
                </span>
                <span className={cn(typography.caption.size, "text-emerald-200")}>
                    Memories are sent with each message to help the AI recall important details.
                </span>
            </div>
        </div>
    );
}
