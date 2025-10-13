import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, BookOpen, Edit2 } from "lucide-react";
import type { Scene } from "../../../../core/storage/schemas";
import { typography, radius, spacing, interactive, shadows, cn } from "../../../design-tokens";

interface StartingSceneStepProps {
  scenes: Scene[];
  onScenesChange: (scenes: Scene[]) => void;
  defaultSceneId: string | null;
  onDefaultSceneIdChange: (id: string | null) => void;
  onContinue: () => void;
  canContinue: boolean;
}

export function StartingSceneStep({
  scenes,
  onScenesChange,
  defaultSceneId,
  onDefaultSceneIdChange,
  onContinue,
  canContinue,
}: StartingSceneStepProps) {
  const [newSceneContent, setNewSceneContent] = React.useState("");
  const [editingSceneId, setEditingSceneId] = React.useState<string | null>(null);
  const [editingSceneContent, setEditingSceneContent] = React.useState("");

  const addScene = () => {
    if (!newSceneContent.trim()) return;

    const sceneId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const timestamp = Date.now();

    const newScene: Scene = {
      id: sceneId,
      content: newSceneContent.trim(),
      createdAt: timestamp,
    };

    const updatedScenes = [...scenes, newScene];
    onScenesChange(updatedScenes);

    // Set as default if it's the first scene
    if (scenes.length === 0) {
      onDefaultSceneIdChange(sceneId);
    }

    setNewSceneContent("");
  };

  const deleteScene = (sceneId: string) => {
    const updatedScenes = scenes.filter((s) => s.id !== sceneId);
    onScenesChange(updatedScenes);

    // Clear default if we're deleting the default scene
    if (defaultSceneId === sceneId) {
      onDefaultSceneIdChange(updatedScenes[0]?.id || null);
    }
  };

  const startEditingScene = (scene: Scene) => {
    setEditingSceneId(scene.id);
    setEditingSceneContent(scene.content);
  };

  const saveEditedScene = () => {
    if (!editingSceneId || !editingSceneContent.trim()) return;

    const updatedScenes = scenes.map(scene => 
      scene.id === editingSceneId 
        ? { ...scene, content: editingSceneContent.trim() }
        : scene
    );
    onScenesChange(updatedScenes);

    setEditingSceneId(null);
    setEditingSceneContent("");
  };

  const cancelEditingScene = () => {
    setEditingSceneId(null);
    setEditingSceneContent("");
  };

  return (
    <motion.div
      key="starting-scene"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={spacing.section}
    >
      {/* Title */}
      <div className={spacing.tight}>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-blue-400/30 bg-blue-400/10 p-1.5">
            <BookOpen className="h-4 w-4 text-blue-400" />
          </div>
          <h2 className={cn(typography.h1.size, typography.h1.weight, "text-white")}>
            Starting Scenes
          </h2>
          {scenes.length > 0 && (
            <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">
              {scenes.length}
            </span>
          )}
        </div>
        <p className={cn(typography.body.size, "mt-2 text-white/50")}>
          Create opening scenarios for your conversations
        </p>
      </div>

      {/* Existing Scenes */}
      <AnimatePresence mode="popLayout">
        {scenes.length > 0 && (
          <motion.div layout className={spacing.item}>
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
                          onClick={() => onDefaultSceneIdChange(scene.id)}
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
      <motion.div layout className={spacing.item}>
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

      {/* Continue Button */}
      <div className="pt-2">
        <motion.button
          disabled={!canContinue}
          onClick={onContinue}
          whileTap={{ scale: canContinue ? 0.97 : 1 }}
          className={cn(
            "w-full py-4 text-base font-semibold",
            radius.md,
            interactive.transition.fast,
            canContinue
              ? cn(
                  "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
                  shadows.glow,
                  "active:border-emerald-400/60 active:bg-emerald-400/30"
                )
              : "cursor-not-allowed border border-white/5 bg-white/5 text-white/30"
          )}
        >
          Continue to Details
        </motion.button>
      </div>
    </motion.div>
  );
}