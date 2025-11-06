import { SetStateAction, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Save, Loader2, Plus, X, Sparkles, BookOpen, Cpu, Edit2, Image, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { listCharacters, saveCharacter, readSettings } from "../../../core/storage/repo";
import type { Model, Scene, SystemPromptTemplate } from "../../../core/storage/schemas";
import { processBackgroundImage } from "../../../core/utils/image";
import { convertToImageRef } from "../../../core/storage/images";
import { saveAvatar, loadAvatar } from "../../../core/storage/avatars";
import { listPromptTemplates } from "../../../core/prompts/service";
import { invalidateAvatarCache } from "../../hooks/useAvatar";

export function EditCharacterPage() {
  const navigate = useNavigate();
  const { characterId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarPath, setAvatarPath] = useState("");
  const [backgroundImagePath, setBackgroundImagePath] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [defaultSceneId, setDefaultSceneId] = useState<string | null>(null);
  const [newSceneContent, setNewSceneContent] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [systemPromptTemplateId, setSystemPromptTemplateId] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<SystemPromptTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingSceneContent, setEditingSceneContent] = useState("");

  useEffect(() => {
    if (!characterId) {
      navigate("/chat");
      return;
    }

    loadCharacter();
    loadModels();
    loadPromptTemplates();
  }, [characterId]);

  // Auto-set default scene if there's only one scene
  useEffect(() => {
    if (scenes.length === 1 && !defaultSceneId) {
      setDefaultSceneId(scenes[0].id);
    }
  }, [scenes, defaultSceneId]);

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
      
      // Load avatar if it exists
      if (character.avatarPath) {
        try {
          const avatarUrl = await loadAvatar(character.id, character.avatarPath);
          setAvatarPath(avatarUrl || "");
        } catch (err) {
          console.warn("Failed to load avatar:", err);
          setAvatarPath("");
        }
      } else {
        setAvatarPath("");
      }
      
      let backgroundImage = character.backgroundImagePath || "";
      if (backgroundImage && !backgroundImage.startsWith("data:") && backgroundImage.length === 36) {
        try {
          const { convertToImageUrl } = await import("../../../core/storage/images");
          const assetUrl = await convertToImageUrl(backgroundImage);
          backgroundImage = assetUrl || backgroundImage;
        } catch (err) {
          console.warn("Failed to convert background image ID to URL:", err);
        }
      }
      
      setBackgroundImagePath(backgroundImage);
      setScenes(character.scenes || []);
      setDefaultSceneId(character.defaultSceneId || null);
      setSelectedModelId(character.defaultModelId || null);
      setSystemPromptTemplateId(character.promptTemplateId || null);
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

  const loadPromptTemplates = async () => {
    try {
      setLoadingTemplates(true);
      // Global list (scopes removed)
      const templates = await listPromptTemplates();
      setPromptTemplates(templates);
    } catch (err) {
      console.error("Failed to load prompt templates:", err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSave = async () => {
    if (!characterId || !name.trim() || !description.trim()) return;

    try {
      setSaving(true);
      setError(null);

      // Save avatar using new centralized system if it's a new upload (data URL)
      let avatarFilename: string | undefined = undefined;
      if (avatarPath) {
        if (avatarPath.startsWith("data:")) {
          avatarFilename = await saveAvatar(characterId, avatarPath);
          if (!avatarFilename) {
            console.error("[EditCharacter] Failed to save avatar image");
          } else {
            invalidateAvatarCache(characterId);
          }
        } else {
          avatarFilename = avatarPath;
        }
      } else {
        invalidateAvatarCache(characterId);
      }

      const backgroundImageId = backgroundImagePath 
        ? (backgroundImagePath.startsWith("data:") ? await convertToImageRef(backgroundImagePath) : backgroundImagePath)
        : undefined;

      await saveCharacter({
        id: characterId,
        name: name.trim(),
        description: description.trim(),
        avatarPath: avatarFilename,
        backgroundImagePath: backgroundImageId,
        scenes: scenes,
        defaultSceneId: defaultSceneId,
        defaultModelId: selectedModelId,
        promptTemplateId: systemPromptTemplateId,
      });

      navigate("/chat");
    } catch (err: any) {
      console.error("Failed to save character:", err);
      setError(err?.message || "Failed to save character");
    } finally {
      setSaving(false);
    }
  };

  const addScene = () => {
    if (!newSceneContent.trim()) return;
    
    const sceneId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const timestamp = Date.now();
    
    const newScenes = [...scenes, {
      id: sceneId,
      content: newSceneContent.trim(),
      createdAt: timestamp,
    }];
    
    setScenes(newScenes);
    
    // Auto-set as default if it's the only scene
    if (newScenes.length === 1) {
      setDefaultSceneId(sceneId);
    }
    
    setNewSceneContent("");
  };

  const deleteScene = (sceneId: string) => {
    const newScenes = scenes.filter(s => s.id !== sceneId);
    setScenes(newScenes);
    
    // Clear default if we're deleting the default scene
    if (defaultSceneId === sceneId) {
      // Auto-set to the only remaining scene if there's exactly one left
      setDefaultSceneId(newScenes.length === 1 ? newScenes[0].id : null);
    }
  };

  const startEditingScene = (scene: Scene) => {
    setEditingSceneId(scene.id);
    setEditingSceneContent(scene.content);
  };

  const saveEditedScene = () => {
    if (!editingSceneId || !editingSceneContent.trim()) return;

    setScenes(scenes.map(scene => 
      scene.id === editingSceneId 
        ? { ...scene, content: editingSceneContent.trim() }
        : scene
    ));

    setEditingSceneId(null);
    setEditingSceneContent("");
  };

  const cancelEditingScene = () => {
    setEditingSceneId(null);
    setEditingSceneContent("");
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

  // Handle background image upload
  const handleBackgroundImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const input = event.target;
    void processBackgroundImage(file)
      .then((dataUrl: SetStateAction<string>) => {
        setBackgroundImagePath(dataUrl);
      })
      .catch((error: any) => {
        console.warn("EditCharacter: failed to process background image", error);
      })
      .finally(() => {
        input.value = "";
      });
  };

  // Handle avatar upload
  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPath(reader.result as string);
    };
    reader.readAsDataURL(file);
    
    // Clear input so same file can be selected again
    event.target.value = "";
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
              <div className="relative h-16 w-16 flex-shrink-0">
                <label className="relative block h-full w-full cursor-pointer overflow-hidden rounded-2xl border border-white/10 group">
                  {getAvatarPreview()}
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <Edit2 className="h-5 w-5 text-white" />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>
                {/* Remove avatar button */}
                {avatarPath && (
                  <button
                    onClick={() => setAvatarPath("")}
                    className="absolute -top-2 -right-2 rounded-full border border-white/20 bg-red-500/90 p-1 text-white transition hover:bg-red-600 active:scale-95"
                    title="Remove avatar"
                  >
                    <X size={12} />
                  </button>
                )}
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

          {/* Background Image Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-purple-400/30 bg-purple-400/10 p-1.5">
                <Image className="h-4 w-4 text-purple-400" />
              </div>
              <h3 className="text-sm font-semibold text-white">Chat Background</h3>
              <span className="text-xs text-white/40">(Optional)</span>
            </div>
            
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
              {backgroundImagePath ? (
                <div className="relative">
                  <img 
                    src={backgroundImagePath} 
                    alt="Background preview" 
                    className="h-32 w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <span className="text-xs text-white/80 bg-black/50 px-2 py-1 rounded">
                      Background Preview
                    </span>
                  </div>
                  <button
                    onClick={() => setBackgroundImagePath("")}
                    className="absolute top-2 right-2 rounded-full border border-white/20 bg-black/50 p-1 text-white/70 transition hover:bg-black/70 active:scale-95"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 transition hover:bg-white/5">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <Image size={20} className="text-white/40" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-white/70">Add Background Image</p>
                    <p className="text-xs text-white/40">Tap to select an image</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBackgroundImageUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <p className="text-xs text-white/50">
              Optional background image for chat conversations with this character
            </p>
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
            <div className="rounded-xl border border-blue-400/20 bg-blue-400/10 px-3.5 py-3">
              <div className="text-[11px] font-medium text-blue-200">Available Placeholders</div>
              <div className="mt-2 space-y-1 text-xs text-blue-200/70">
                <div><code className="text-emerald-300">{"{{char}}"}</code> - Character name</div>
                <div><code className="text-emerald-300">{"{{persona}}"}</code> - Persona name (empty if none)</div>
              </div>
            </div>
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
                <motion.div layout className="space-y-3">
                  {scenes.map((scene, index) => {
                    const isEditing = editingSceneId === scene.id;
                    const isDefault = defaultSceneId === scene.id;
                    
                    return (
                      <motion.div
                        key={scene.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, x: -20 }}
                        transition={{ duration: 0.15 }}
                        className={`overflow-hidden rounded-xl border ${
                          isDefault 
                            ? "border-emerald-400/30 bg-emerald-400/5" 
                            : "border-white/10 bg-white/5"
                        }`}
                      >
                        {/* Scene Header */}
                        <div className={`flex items-center gap-2 border-b px-3.5 py-2.5 ${
                          isDefault 
                            ? "border-emerald-400/20 bg-emerald-400/10" 
                            : "border-white/10 bg-white/5"
                        }`}>
                          {/* Scene number badge */}
                          <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border text-xs font-medium ${
                            isDefault
                              ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-300"
                              : "border-white/10 bg-white/5 text-white/60"
                          }`}>
                            {index + 1}
                          </div>
                          
                          {/* Default badge */}
                          {isDefault && (
                            <div className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/20 px-2 py-0.5">
                              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              <span className="text-[10px] font-medium text-emerald-200">Default Scene</span>
                            </div>
                          )}
                          
                          {/* Actions */}
                          <div className="ml-auto flex items-center gap-1.5">
                            {!isEditing && !isDefault && (
                              <button
                                onClick={() => setDefaultSceneId(scene.id)}
                                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-white/60 transition active:scale-95 active:bg-white/10"
                              >
                                Set Default
                              </button>
                            )}
                            {!isEditing && (
                              <button
                                onClick={() => startEditingScene(scene)}
                                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/60 transition active:scale-95 active:bg-white/10"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {!isEditing && (
                              <button
                                onClick={() => deleteScene(scene.id)}
                                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/50 transition active:bg-red-400/10 active:text-red-400"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Scene Content */}
                        <div className="p-3.5">
                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingSceneContent}
                                onChange={(e) => setEditingSceneContent(e.target.value)}
                                rows={4}
                                className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm leading-relaxed text-white placeholder-white/40 transition focus:border-white/25 focus:outline-none"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={cancelEditingScene}
                                  className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-medium text-white/70 transition active:scale-95 active:bg-white/10"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={saveEditedScene}
                                  disabled={!editingSceneContent.trim()}
                                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
                                    editingSceneContent.trim()
                                      ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 active:scale-95 active:bg-emerald-400/30"
                                      : "border border-white/5 bg-white/5 text-white/30"
                                  }`}
                                >
                                  Save Changes
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm leading-relaxed text-white/90">{scene.content}</p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Add New Scene */}
            <motion.div layout className="space-y-2">
              <textarea
                value={newSceneContent}
                onChange={(e) => setNewSceneContent(e.target.value)}
                rows={3}
                placeholder="Create a starting scene or scenario for roleplay (e.g., 'You find yourself in a mystical forest at twilight...')"
                className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm leading-relaxed text-white placeholder-white/40 transition focus:border-white/25 focus:outline-none"
              />
              <motion.button
                onClick={addScene}
                disabled={!newSceneContent.trim()}
                whileTap={{ scale: newSceneContent.trim() ? 0.97 : 1 }}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  newSceneContent.trim()
                    ? "border border-blue-400/40 bg-blue-400/20 text-blue-100 active:bg-blue-400/30"
                    : "border border-white/10 bg-white/5 text-white/40"
                }`}
              >
                <Plus className="h-4 w-4" />
                Add Scene
              </motion.button>
            </motion.div>
            
            <p className="text-xs text-white/50">
              Create multiple starting scenarios. One will be selected when starting a new chat.
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

          {/* System Prompt Template Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-blue-400/30 bg-blue-400/10 p-1.5">
                <FileText className="h-4 w-4 text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-white">System Prompt</h3>
              <span className="ml-auto text-xs text-white/40">(Optional)</span>
            </div>
            
            {loadingTemplates ? (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                <span className="text-sm text-white/50">Loading templates...</span>
              </div>
            ) : (
              <select
                value={systemPromptTemplateId || ""}
                onChange={(e) => setSystemPromptTemplateId(e.target.value || null)}
                className="w-full appearance-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm text-white transition focus:border-white/25 focus:outline-none"
              >
                <option value="">Use app default</option>
                {promptTemplates
                  .filter(t => t.name !== "App Default")
                  .map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
              </select>
            )}
            <p className="text-xs text-white/50">
              Select a custom system prompt template for this character
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
