import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Save, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { getPersona, savePersona } from "../../../core/storage/repo";

export function EditPersonaPage() {
  const navigate = useNavigate();
  const { personaId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!personaId) {
      navigate("/personas");
      return;
    }

    loadPersona();
  }, [personaId]);

  const loadPersona = async () => {
    if (!personaId) return;

    try {
      const persona = await getPersona(personaId);
      if (!persona) {
        navigate("/personas");
        return;
      }

      setTitle(persona.title);
      setDescription(persona.description);
      setIsDefault(persona.isDefault || false);
    } catch (err) {
      console.error("Failed to load persona:", err);
      setError("Failed to load persona");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!personaId || !title.trim() || !description.trim()) return;

    try {
      setSaving(true);
      setError(null);

      await savePersona({
        id: personaId,
        title: title.trim(),
        description: description.trim(),
        isDefault,
      });

      navigate("/personas");
    } catch (err: any) {
      console.error("Failed to save persona:", err);
      setError(err?.message || "Failed to save persona");
    } finally {
      setSaving(false);
    }
  };

  const canSave = title.trim().length > 0 && description.trim().length > 0 && !saving;

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

          {/* Title Input */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">
              PERSONA NAME
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Professional, Creative Writer, Student..."
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
            />
            <p className="text-xs text-white/50">
              Give your persona a descriptive name
            </p>
          </div>

          {/* Description Input */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">
              DESCRIPTION
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Describe how the AI should address you, your preferences, background, or communication style..."
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
            />
            <p className="text-xs text-white/50">
              Be specific about how you want to be addressed
            </p>
          </div>

          {/* Default Toggle */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#0b0c12]/90 p-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-white">
                  Set as Default
                </label>
                <p className="mt-1 text-xs text-gray-400">
                  Use this persona for all new conversations
                </p>
              </div>
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-white/20 bg-white/10 text-emerald-500 focus:ring-2 focus:ring-emerald-400/40 focus:ring-offset-0"
              />
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`w-full rounded-xl px-4 py-3 text-sm font-medium transition active:scale-[0.99] ${
              canSave
                ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30"
                : "border border-white/10 bg-white/5 text-white/30"
            }`}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </span>
            )}
          </button>
        </motion.div>
      </main>
    </div>
  );
}
