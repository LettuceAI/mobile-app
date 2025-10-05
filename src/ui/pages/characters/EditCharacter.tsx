import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Save, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { listCharacters, saveCharacter, readSettings } from "../../../core/storage/repo";
import type { Model } from "../../../core/storage/schemas";
import { AvatarPreview } from "./components/AvatarPreview";

export function EditCharacterPage() {
  const navigate = useNavigate();
  const { characterId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarPath, setAvatarPath] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (!characterId) {
      navigate("/chat");
      return;
    }

    loadCharacter();
    loadModels();
  }, [characterId]);

  const loadCharacter = async () => {
    if (!characterId) return;

    try {
      const allCharacters = await listCharacters();
      const character = allCharacters.find(c => c.id === characterId);
      if (!character) {
        navigate("/chat");
        return;
      }

      setName(character.name);
      setDescription(character.description || "");
      setAvatarPath(character.avatarPath || "");
      setSelectedModelId(character.defaultModelId || null);
    } catch (err) {
      console.error("Failed to load character:", err);
      setError("Failed to load character");
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      setLoadingModels(true);
      const settings = await readSettings();
      setModels(settings.models);
    } catch (err) {
      console.error("Failed to load models:", err);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    if (!characterId || !name.trim() || !description.trim()) return;

    try {
      setSaving(true);
      setError(null);

      await saveCharacter({
        id: characterId,
        name: name.trim(),
        description: description.trim(),
        avatarPath: avatarPath || undefined,
        defaultModelId: selectedModelId,
      });

      navigate("/chat");
    } catch (err: any) {
      console.error("Failed to save character:", err);
      setError(err?.message || "Failed to save character");
    } finally {
      setSaving(false);
    }
  };

  const canSave = name.trim().length > 0 && description.trim().length > 0 && !saving;

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

          {/* Avatar Preview */}
          <div className="flex justify-center">
            <AvatarPreview avatarPath={avatarPath} name={name} />
          </div>

          {/* Name Input */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">
              CHARACTER NAME
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Luna, Professor Oak, Chef Remy..."
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
            />
            <p className="text-xs text-white/50">
              Give your character a memorable name
            </p>
          </div>

          {/* Description Input */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">
              PERSONALITY & BACKGROUND
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              placeholder="Describe who this character is, their personality, background, speaking style, and how they should interact..."
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
            />
            <p className="text-xs text-white/50">
              Be detailed to create a unique personality
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">
              DEFAULT MODEL (OPTIONAL)
            </label>
            {loadingModels ? (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                <span className="text-sm text-white/50">Loading models...</span>
              </div>
            ) : models.length > 0 ? (
              <select
                value={selectedModelId || ""}
                onChange={(e) => setSelectedModelId(e.target.value || null)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white transition focus:border-white/30 focus:outline-none"
              >
                <option value="">Use global default model</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-sm text-white/50">No models available</p>
              </div>
            )}
            <p className="text-xs text-white/50">
              Override the default AI model for this character
            </p>
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
