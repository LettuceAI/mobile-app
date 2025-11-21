import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, Camera, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { savePersona } from "../../../core/storage/repo";
import { saveAvatar } from "../../../core/storage/avatars";
import { invalidateAvatarCache } from "../../hooks/useAvatar";

const wordCount = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
};

export function CreatePersonaPage() {
    const navigate = useNavigate();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [avatarPath, setAvatarPath] = useState<string | null>(null);
    const [isDefault, setIsDefault] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSave = title.trim().length > 0 && description.trim().length > 0 && !saving;

    const handleAvatarUpload = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                setAvatarPath(reader.result as string);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    const handleSave = async () => {
        if (!canSave) return;

        try {
            setSaving(true);
            setError(null);

            // Generate persona ID first
            const personaId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

            // Save avatar if provided
            let avatarFilename: string | undefined = undefined;
            if (avatarPath) {
                avatarFilename = await saveAvatar("persona", personaId, avatarPath);
                if (!avatarFilename) {
                    console.error("[CreatePersona] Failed to save avatar image");
                } else {
                    invalidateAvatarCache("persona", personaId);
                }
            }

            await savePersona({
                id: personaId,
                title: title.trim(),
                description: description.trim(),
                avatarPath: avatarFilename,
                isDefault,
            });

            navigate("/chat");
        } catch (e: any) {
            setError(e?.message || "Failed to save persona");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-[#050505] text-gray-100">
            {/* Custom TopNav for Create Page */}
            <header
                className="border-b border-white/5 bg-[#050505]"
                style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
            >
                <div className="relative mx-auto flex h-14 w-full items-center justify-center px-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="absolute left-4 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-white/30 hover:text-white active:scale-95"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back
                    </button>
                    <div className="flex flex-col items-center">
                        <span className="text-[11px] uppercase tracking-[0.4em] text-gray-500">LettuceAI</span>
                        <span className="text-sm font-semibold text-white">Create</span>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 overflow-y-auto px-4 pb-20 pt-6">
                <PersonaStep
                    title={title}
                    onTitleChange={setTitle}
                    description={description}
                    onDescriptionChange={setDescription}
                    avatarPath={avatarPath}
                    onAvatarChange={setAvatarPath}
                    onAvatarUpload={handleAvatarUpload}
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
    avatarPath,
    onAvatarChange,
    onAvatarUpload,
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
    avatarPath: string | null;
    onAvatarChange: (value: string | null) => void;
    onAvatarUpload: () => void;
    isDefault: boolean;
    onDefaultChange: (value: boolean) => void;
    onSave: () => void;
    canSave: boolean;
    saving: boolean;
    error: string | null;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="space-y-6"
        >
            {/* Title */}
            <div className="space-y-1.5">
                <h2 className="text-xl font-semibold text-white">Create Persona</h2>
                <p className="text-sm text-white/50">Define a reusable writing style</p>
            </div>

            {/* Avatar Section */}
            <div className="space-y-3">
                <label className="text-[11px] font-medium uppercase tracking-[0.35em] text-white/70">
                    Avatar
                </label>
                <div className="flex items-center gap-4">
                    {/* Avatar Preview with Upload Button */}
                    <button
                        onClick={onAvatarUpload}
                        className="group relative h-32 w-32 overflow-hidden rounded-full border-2 border-white/10 bg-gradient-to-br from-white/5 to-white/10 backdrop-blur-xl transition hover:border-white/30 active:scale-95"
                    >
                        {avatarPath ? (
                            <img
                                src={avatarPath}
                                alt="Persona avatar"
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center">
                                <Camera className="text-white/30" size={32} />
                            </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
                            <Camera className="text-white" size={24} />
                        </div>
                    </button>

                    {/* Remove Button */}
                    {avatarPath && (
                        <button
                            onClick={() => onAvatarChange(null)}
                            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/70 backdrop-blur-xl transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300 active:scale-95"
                        >
                            <X size={20} strokeWidth={3} />
                        </button>
                    )}
                </div>
                <p className="text-xs text-white/40">
                    Optional: Add a visual identity for this persona
                </p>
            </div>

            {/* Title Input */}
            <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-[0.35em] text-white/70">
                    Title
                </label>
                <input
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    placeholder="Professional Writer"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/40 backdrop-blur-xl transition focus:border-white/30 focus:bg-black/30 focus:outline-none"
                    autoFocus
                />
                <p className="text-xs text-white/40">
                    A short name for this persona
                </p>
            </div>

            {/* Description Textarea */}
            <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-[0.35em] text-white/70">
                    Description
                </label>
                <textarea
                    value={description}
                    onChange={(e) => onDescriptionChange(e.target.value)}
                    rows={7}
                    placeholder="Write in a professional, clear, and concise style. Use formal language and focus on delivering information effectively..."
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-relaxed text-white placeholder-white/40 backdrop-blur-xl transition focus:border-white/30 focus:bg-black/30 focus:outline-none"
                />
                <div className="flex justify-end text-[11px] text-white/40">
                    {wordCount(description)} words
                </div>
                <p className="text-xs text-white/40">
                    Describe the writing style or personality traits
                </p>
            </div>

            {/* Default Option */}
            <div className="space-y-2">
                <button
                    onClick={() => onDefaultChange(!isDefault)}
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-xl transition hover:border-white/25 hover:bg-white/5 active:scale-[0.99]"
                >
                    <div className="flex items-center gap-3">
                        <div className={`rounded-lg p-2 transition ${isDefault ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-white/50'}`}>
                            <Bookmark size={16} />
                        </div>
                        <div className="text-left">
                            <h3 className="text-sm font-medium text-white">
                                Set as default persona
                            </h3>
                            <p className="text-xs text-white/40">
                                Auto-apply to new chats
                            </p>
                        </div>
                    </div>

                    <div className="relative">
                        <div
                            className={`h-6 w-11 rounded-full transition-colors ${isDefault ? "bg-emerald-400/40" : "bg-white/20"
                                }`}
                        >
                            <div
                                className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${isDefault ? "translate-x-5 bg-emerald-300" : "translate-x-0.5 bg-white"
                                    }`}
                            />
                        </div>
                    </div>
                </button>
            </div>

            {/* Error Display */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 backdrop-blur-xl"
                    >
                        <p className="text-sm text-red-200">{error}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create Button */}
            <div className="pt-4">
                <motion.button
                    disabled={!canSave}
                    onClick={onSave}
                    whileTap={{ scale: canSave ? 0.98 : 1 }}
                    className={`w-full rounded-xl py-3.5 text-sm font-semibold transition ${canSave
                            ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 shadow-[0_8px_24px_rgba(52,211,153,0.15)] hover:border-emerald-400/60 hover:bg-emerald-400/30"
                            : "cursor-not-allowed border border-white/5 bg-white/5 text-white/30"
                        }`}
                >
                    {saving ? (
                        <div className="flex items-center justify-center gap-2">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200/30 border-t-emerald-200" />
                            <span>Creating Persona...</span>
                        </div>
                    ) : (
                        "Create Persona"
                    )}
                </motion.button>
            </div>
        </motion.div>
    );
}
