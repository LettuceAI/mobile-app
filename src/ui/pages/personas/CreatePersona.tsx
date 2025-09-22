import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Bookmark } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { savePersona } from "../../../core/storage/repo";

export function CreatePersonaPage() {
    const navigate = useNavigate();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [isDefault, setIsDefault] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSave = title.trim().length > 0 && description.trim().length > 0 && !saving;

    const handleSave = async () => {
        if (!canSave) return;

        try {
            setSaving(true);
            setError(null);

            await savePersona({
                title: title.trim(),
                description: description.trim(),
                isDefault,
            });

            navigate("/settings");
        } catch (e: any) {
            setError(e?.message || "Failed to save persona");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-gray-100">
            {/* Content */}
            <main className="px-6 pb-32">
                <PersonaStep
                    title={title}
                    onTitleChange={setTitle}
                    description={description}
                    onDescriptionChange={setDescription}
                    isDefault={isDefault}
                    onDefaultChange={setIsDefault}
                    onSave={handleSave}
                    canSave={canSave}
                    saving={saving}
                    error={error}
                />
            </main>
        </div>
    );
}

function PersonaStep({
    title,
    onTitleChange,
    description,
    onDescriptionChange,
    isDefault,
    onDefaultChange,
    onSave,
    canSave,
    saving,
    error,
}: {
    title: string;
    onTitleChange: (value: string) => void;
    description: string;
    onDescriptionChange: (value: string) => void;
    isDefault: boolean;
    onDefaultChange: (value: boolean) => void;
    onSave: () => void;
    canSave: boolean;
    saving: boolean;
    error: string | null;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
        >
            {/* Title */}
            <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-white">Create your persona</h2>
                <p className="text-gray-400">Define a reusable writing style or personality</p>
            </div>

            {/* Title Input */}
            <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-300">
                    Persona Title
                </label>
                <input
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    placeholder="Professional Writer"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-lg text-white placeholder-gray-500 transition focus:border-white/20 focus:bg-white/10 focus:outline-none"
                    autoFocus
                />
                <p className="text-xs text-gray-500">
                    A short name for this persona
                </p>
            </div>

            {/* Description Textarea */}
            <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-300">
                    Persona Description
                </label>
                <textarea
                    value={description}
                    onChange={(e) => onDescriptionChange(e.target.value)}
                    rows={6}
                    placeholder="Write in a professional, clear, and concise style. Use formal language and focus on delivering information effectively..."
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-base text-white placeholder-gray-500 transition focus:border-white/20 focus:bg-white/10 focus:outline-none"
                />
                <p className="text-xs text-gray-500">
                    Describe the writing style or personality traits
                </p>
            </div>

            {/* Default Option */}
            <div className="space-y-3">
                <div
                    onClick={() => onDefaultChange(!isDefault)}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-6 py-4 cursor-pointer transition hover:bg-white/10"
                >
                    <div className="flex items-center gap-3">
                        <div className={`rounded-lg p-2 ${isDefault ? 'bg-purple-500/20' : 'bg-white/10'}`}>
                            <Bookmark size={16} className={isDefault ? "text-purple-400" : "text-gray-400"} />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-gray-300">
                                Set as default persona
                            </h3>
                            <p className="text-xs text-gray-500">
                                This persona will be automatically applied to new chats
                            </p>
                        </div>
                    </div>

                    <div className="relative">
                        <div
                            className={`h-6 w-11 rounded-full transition-colors ${isDefault ? "bg-purple-500" : "bg-white/20"
                                }`}
                        >
                            <div
                                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${isDefault ? "translate-x-5" : "translate-x-0.5"
                                    }`}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Error Display */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4"
                    >
                        <p className="text-red-200 text-sm">{error}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create Button */}
            <div className="pt-8">
                <motion.button
                    disabled={!canSave}
                    onClick={onSave}
                    whileTap={{ scale: 0.98 }}
                    whileHover={{ scale: 1.02 }}
                    className={`w-full rounded-2xl py-4 text-base font-semibold transition ${canSave
                            ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg hover:shadow-xl"
                            : "cursor-not-allowed bg-gray-600/50 text-gray-400"
                        }`}
                >
                    {saving ? (
                        <div className="flex items-center justify-center gap-2">
                            <Loader2 size={18} className="animate-spin" />
                            <span>Creating...</span>
                        </div>
                    ) : (
                        "Create Persona"
                    )}
                </motion.button>
            </div>
        </motion.div>
    );
}