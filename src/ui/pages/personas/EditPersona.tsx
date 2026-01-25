import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Loader2, X, Download } from "lucide-react";
import { motion } from "framer-motion";
import { usePersonaFormController } from "./hooks/usePersonaFormController";
import {
  exportPersona,
  downloadJson,
  generateExportFilename,
} from "../../../core/storage/personaTransfer";
import { AvatarPicker } from "../../components/AvatarPicker";

const wordCount = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};

export function EditPersonaPage() {
  const { personaId } = useParams();
  const {
    state: {
      loading,
      saving,
      error,
      title,
      description,
      isDefault,
      avatarPath,
      avatarCrop,
      avatarRoundPath,
    },
    setTitle,
    setDescription,
    setIsDefault,
    setAvatarPath,
    setAvatarCrop,
    setAvatarRoundPath,
    handleSave,
    canSave,
  } = usePersonaFormController(personaId);

  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const globalWindow = window as any;
    globalWindow.__savePersona = handleSave;
    globalWindow.__savePersonaCanSave = canSave;
    globalWindow.__savePersonaSaving = saving;
    return () => {
      delete globalWindow.__savePersona;
      delete globalWindow.__savePersonaCanSave;
      delete globalWindow.__savePersonaSaving;
    };
  }, [handleSave, canSave, saving]);

  const handleExport = async () => {
    if (!personaId) return;

    try {
      setExporting(true);
      const exportJson = await exportPersona(personaId);
      const filename = generateExportFilename(title || "persona");
      await downloadJson(exportJson, filename);
    } catch (err: any) {
      console.error("Failed to export persona:", err);
      alert(err?.message || "Failed to export persona");
    } finally {
      setExporting(false);
    }
  };

  const handleAvatarChange = (newPath: string) => {
    setAvatarPath(newPath || null);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col pb-16 text-gray-200">
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="space-y-6"
        >
          {/* Error Message */}
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {/* Avatar Section */}
          <div className="flex flex-col items-center py-4">
            <div className="relative">
              <AvatarPicker
                currentAvatarPath={avatarPath ?? ""}
                onAvatarChange={handleAvatarChange}
                avatarCrop={avatarCrop}
                onAvatarCropChange={setAvatarCrop}
                avatarRoundPath={avatarRoundPath}
                onAvatarRoundChange={setAvatarRoundPath}
                placeholder={title.trim().charAt(0).toUpperCase() || "?"}
              />

              {/* Remove Button */}
              {avatarPath && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatarPath(null);
                    setAvatarCrop(null);
                    setAvatarRoundPath(null);
                  }}
                  className="absolute -top-1 -left-1 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#1a1a1c] text-white/60 transition hover:bg-red-500/80 hover:border-red-500/50 hover:text-white active:scale-95"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-white/40">Tap to add or generate avatar</p>
          </div>

          {/* Title Input */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">PERSONA NAME</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Professional, Creative Writer, Student..."
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
            />
            <p className="text-xs text-white/50">Give your persona a descriptive name</p>
          </div>

          {/* Description Input */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">DESCRIPTION</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Describe how the AI should address you, your preferences, background, or communication style..."
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
            />
            <div className="flex justify-end text-[11px] text-white/40">
              {wordCount(description)} words
            </div>
            <p className="text-xs text-white/50">Be specific about how you want to be addressed</p>
          </div>

          {/* Default Toggle */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#0b0c12]/90 p-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-white">Set as Default</label>
                <p className="mt-1 text-xs text-gray-400">
                  Use this persona for all new conversations
                </p>
              </div>
              <div className="flex items-center">
                <input
                  id="set-as-default"
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="peer sr-only"
                />
                <label
                  htmlFor="set-as-default"
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-400/40 ${
                    isDefault ? "bg-emerald-500 shadow-lg shadow-emerald-500/30" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isDefault ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Export Button */}
          <motion.button
            onClick={handleExport}
            disabled={!personaId || exporting}
            whileTap={{ scale: exporting ? 1 : 0.98 }}
            className="w-full rounded-xl border border-blue-400/40 bg-blue-400/20 px-4 py-3.5 text-sm font-semibold text-blue-100 transition hover:bg-blue-400/30 disabled:opacity-50"
          >
            {exporting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Download className="h-4 w-4" />
                Export Persona
              </span>
            )}
          </motion.button>
        </motion.div>
      </main>
    </div>
  );
}
