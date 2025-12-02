import { Dispatch } from "react";
import { Bookmark, Camera, X, Upload, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PersonaFormState, PersonaFormAction } from "../hooks/createPersonaReducer";
import { AvatarPicker } from "../../../components/AvatarPicker";

const wordCount = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};

interface CreatePersonaFormProps {
  state: PersonaFormState;
  dispatch: Dispatch<PersonaFormAction>;
  canSave: boolean;
  onSave: () => void;
  onImport: () => void;
}

export function CreatePersonaForm({
  state,
  dispatch,
  canSave,
  onSave,
  onImport,
}: CreatePersonaFormProps) {
  const { title, description, avatarPath, isDefault, saving, importing, error } = state;

  const handleAvatarChange = (newPath: string) => {
    dispatch({ type: "set_avatar_path", value: newPath || null });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Title */}
      <div className="space-y-1.5 text-center">
        <h2 className="text-xl font-semibold text-white">Create Persona</h2>
        <p className="text-sm text-white/50">Define a reusable writing style</p>
      </div>

      <div className="space-y-5 rounded-2xl p-4">
        {/* Avatar Section */}
        <div className="flex flex-col items-center py-4">
          <div className="relative">
            <AvatarPicker
              currentAvatarPath={avatarPath ?? ""}
              onAvatarChange={handleAvatarChange}
              size={"lg"}
              avatarPreview={
                avatarPath ? (
                  <img
                    src={avatarPath}
                    alt="Persona avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Camera className="text-white/30" size={36} />
                  </div>
                )
              }
            />

            {/* Remove Button - top left */}
            {avatarPath && (
              <button
                onClick={() => dispatch({ type: "set_avatar_path", value: null })}
                className="absolute -top-1 -left-1 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#1a1a1c] text-white/60 transition hover:bg-red-500/80 hover:border-red-500/50 hover:text-white active:scale-95"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-white/40">
            Tap camera to add or generate avatar
          </p>
        </div>

        {/* Title Input */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/70">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => dispatch({ type: "set_title", value: e.target.value })}
            placeholder="Professional Writer"
            className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white placeholder-white/40 transition focus:border-white/30 focus:bg-black/40 focus:outline-none"
            autoFocus
          />
          <p className="text-xs text-white/40">
            A short name for this persona
          </p>
        </div>

        {/* Description Textarea */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/70">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => dispatch({ type: "set_description", value: e.target.value })}
            rows={7}
            placeholder="Write in a professional, clear, and concise style. Use formal language and focus on delivering information effectively..."
            className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-relaxed text-white placeholder-white/40 transition focus:border-white/30 focus:bg-black/40 focus:outline-none min-h-[140px] max-h-[320px]"
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
            onClick={() => dispatch({ type: "set_default", value: !isDefault })}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-xl transition hover:border-white/25 hover:bg-white/5 active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 transition ${isDefault ? "bg-emerald-400/20 text-emerald-300" : "bg-white/10 text-white/50"}`}>
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
                className={`h-6 w-11 rounded-full transition-colors ${isDefault ? "bg-emerald-400/40" : "bg-white/20"}`}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${isDefault ? "translate-x-5 bg-emerald-300" : "translate-x-0.5 bg-white"}`}
                />
              </div>
            </div>
          </button>
        </div>
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

      {/* Import Persona */}
      <motion.button
        onClick={onImport}
        disabled={importing}
        whileTap={{ scale: importing ? 1 : 0.98 }}
        className="w-full rounded-xl border border-blue-400/40 bg-blue-400/20 px-4 py-3.5 text-sm font-semibold text-blue-100 transition hover:bg-blue-400/30 disabled:opacity-50"
      >
        {importing ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Importing...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Upload className="h-4 w-4" />
            Import Persona
          </span>
        )}
      </motion.button>

      {/* Create Button */}
      <div className="pt-4">
        <motion.button
          disabled={!canSave}
          onClick={onSave}
          whileTap={{ scale: canSave ? 0.98 : 1 }}
          className={`w-full rounded-xl py-3.5 text-sm font-semibold transition ${
            canSave
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
