import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Save, Loader2, Plus, X, Sparkles, BookOpen, Cpu } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { listCharacters, saveCharacter, readSettings } from "../../../core/storage/repo";
import type { Model } from "../../../core/storage/schemas";

export function EditCharacterPage() {
  const navigate = useNavigate();
  const { characterId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarPath, setAvatarPath] = useState("");
  const [scenes, setScenes] = useState<string[]>([]);
  const [newScene, setNewScene] = useState("");
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
      setScenes(character.scenes || []);
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
        scenes: scenes,
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

  // Get avatar preview for header
  const getAvatarPreview = () => {
    if (!avatarPath) {
      const initial = name.trim().charAt(0) || "?";
      return (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500/20 to-blue-500/20">
          <span className="text-lg font-bold text-white">{initial.toUpperCase()}</span>
        </div>
      );
    }
    return <img src={avatarPath} alt="Avatar" className="h-full w-full object-cover" />;
  };

  return (
    <div className="flex h-full flex-col pb-16 text-gray-200">
      <main className="flex-1 overflow-y-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="space-y-5 pb-6 pt-4"
        >

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3"
              >
                <p className="text-sm text-red-200">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Avatar & Name Card */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02]">
            <div className="flex items-center gap-4 p-4">
              {/* Avatar */}
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl border border-white/10">
                {getAvatarPreview()}
              </div>
              
              {/* Name Input */}
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] font-medium uppercase tracking-wide text-white/50">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Character name..."
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-base text-white placeholder-white/40 transition focus:border-white/25 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Personality Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-1.5">
                <Sparkles className="h-4 w-4 text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-white">Personality & Background</h3>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              placeholder="Describe who this character is, their personality, background, speaking style, and how they should interact..."
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm leading-relaxed text-white placeholder-white/40 transition focus:border-white/25 focus:outline-none"
            />
            <p className="text-xs text-white/50">
              Be detailed to create a unique personality
            </p>
          </div>

          {/* Starting Scenes Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-blue-400/30 bg-blue-400/10 p-1.5">
                <BookOpen className="h-4 w-4 text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-white">Starting Scenes</h3>
              {scenes.length > 0 && (
                <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">
                  {scenes.length}
                </span>
              )}
            </div>
            
            {/* Existing Scenes */}
            <AnimatePresence mode="popLayout">
              {scenes.length > 0 && (
                <motion.div layout className="space-y-2">
                  {scenes.map((scene, index) => (
                    <motion.div
                      key={index}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9, x: -20 }}
                      transition={{ duration: 0.15 }}
                      className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5"
                    >
                      <div className="flex items-start gap-3 p-3.5 pr-12">
                        <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                          <span className="text-xs font-medium text-white/60">{index + 1}</span>
                        </div>
                        <p className="flex-1 text-sm leading-relaxed text-white/90">{scene}</p>
                      </div>
                      <button
                        onClick={() => setScenes(scenes.filter((_, i) => i !== index))}
                        className="absolute right-3 top-3 rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/50 opacity-0 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Add New Scene */}
            <motion.div layout className="space-y-2">
              <textarea
                value={newScene}
                onChange={(e) => setNewScene(e.target.value)}
                rows={3}
                placeholder="Create a starting scene or scenario for roleplay (e.g., 'You find yourself in a mystical forest at twilight...')"
                className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm leading-relaxed text-white placeholder-white/40 transition focus:border-white/25 focus:outline-none"
              />
              <motion.button
                onClick={() => {
                  if (newScene.trim()) {
                    setScenes([...scenes, newScene.trim()]);
                    setNewScene("");
                  }
                }}
                disabled={!newScene.trim()}
                whileTap={{ scale: newScene.trim() ? 0.98 : 1 }}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  newScene.trim()
                    ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30"
                    : "border border-white/10 bg-white/5 text-white/40"
                }`}
              >
                <Plus className="h-4 w-4" />
                Add Scene
              </motion.button>
            </motion.div>
            
            <p className="text-xs text-white/50">
              Create roleplay scenarios. Each scene sets the stage for different story beginnings.
            </p>
          </div>

          {/* Model Selection Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-purple-400/30 bg-purple-400/10 p-1.5">
                <Cpu className="h-4 w-4 text-purple-400" />
              </div>
              <h3 className="text-sm font-semibold text-white">Default Model</h3>
              <span className="ml-auto text-xs text-white/40">(Optional)</span>
            </div>
            
            {loadingModels ? (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                <span className="text-sm text-white/50">Loading models...</span>
              </div>
            ) : models.length > 0 ? (
              <select
                value={selectedModelId || ""}
                onChange={(e) => setSelectedModelId(e.target.value || null)}
                className="w-full appearance-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm text-white transition focus:border-white/25 focus:outline-none"
              >
                <option value="">Use global default model</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-sm text-white/50">No models available</p>
              </div>
            )}
            <p className="text-xs text-white/50">
              Override the default AI model for this character
            </p>
          </div>

          {/* Save Button */}
          <motion.button
            onClick={handleSave}
            disabled={!canSave}
            whileTap={{ scale: canSave ? 0.98 : 1 }}
            className={`w-full rounded-xl px-4 py-3.5 text-sm font-semibold transition ${
              canSave
                ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 shadow-lg shadow-emerald-400/10 hover:bg-emerald-400/30"
                : "border border-white/10 bg-white/5 text-white/40"
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
          </motion.button>
        </motion.div>
      </main>
    </div>
  );
}
