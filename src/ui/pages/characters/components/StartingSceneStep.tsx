import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, BookOpen } from "lucide-react";
import type { Scene } from "../../../../core/storage/schemas";

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
    const updatedScenes = scenes.filter(s => s.id !== sceneId);
    onScenesChange(updatedScenes);
    
    // Clear default if we're deleting the default scene
    if (defaultSceneId === sceneId) {
      onDefaultSceneIdChange(updatedScenes[0]?.id || null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      addScene();
    }
  };

  return (
    <motion.div
      key="starting-scene"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">Starting Scenes</h2>
        <p className="text-sm text-gray-400">
          Add one or more opening scenarios for conversations with this character. You can choose which scene to use when starting a chat.
        </p>
      </div>

      {/* Existing Scenes */}
      <AnimatePresence mode="popLayout">
        {scenes.length > 0 && (
          <motion.div layout className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-blue-400/30 bg-blue-400/10 p-1.5">
                <BookOpen className="h-4 w-4 text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-white">Your Scenes</h3>
              <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">
                {scenes.length}
              </span>
            </div>
            
            {scenes.map((scene, index) => (
              <motion.div
                key={scene.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, x: -20 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden rounded-xl border border-white/10 bg-white/5"
              >
                {/* Scene Header */}
                <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-3.5 py-2.5">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                    <span className="text-xs font-medium text-white/60">{index + 1}</span>
                  </div>
                  
                  {/* Default Scene Radio */}
                  <button
                    onClick={() => onDefaultSceneIdChange(defaultSceneId === scene.id ? null : scene.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                      defaultSceneId === scene.id
                        ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-300"
                        : "border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white/70"
                    }`}
                    title={defaultSceneId === scene.id ? "This is the default starting scene" : "Set as default starting scene"}
                  >
                    <div className={`h-2.5 w-2.5 rounded-full border ${
                      defaultSceneId === scene.id
                        ? "border-emerald-400 bg-emerald-400"
                        : "border-white/30"
                    }`} />
                    <span>{defaultSceneId === scene.id ? "Default" : "Set Default"}</span>
                  </button>
                  
                  <button
                    onClick={() => deleteScene(scene.id)}
                    className="ml-auto rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/50 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                
                {/* Scene Content */}
                <div className="p-3.5">
                  <p className="text-sm leading-relaxed text-white/90">{scene.content}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add New Scene */}
      <div className="space-y-3">
        <label className="text-[11px] font-medium text-white/70">
          {scenes.length === 0 ? "ADD YOUR FIRST SCENE *" : "ADD ANOTHER SCENE (OPTIONAL)"}
        </label>
        <textarea
          value={newSceneContent}
          onChange={(e) => setNewSceneContent(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Describe the setting, scenario, and context for this scene. For example: 'You are both students at a magical academy...' or 'It's a quiet evening in a cozy café...'"
          className="min-h-[120px] w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
          rows={6}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/60">
            {scenes.length === 0 ? "At least one scene is required" : "Press Ctrl+Enter to add"}
          </p>
          <button
            onClick={addScene}
            disabled={!newSceneContent.trim()}
            className={`
              flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-150
              ${
                newSceneContent.trim()
                  ? "border border-blue-400/40 bg-blue-400/20 text-blue-100 hover:border-blue-400/60 hover:bg-blue-400/30"
                  : "border border-white/10 bg-white/5 text-white/40"
              }
            `}
          >
            <Plus className="h-4 w-4" />
            Add Scene
          </button>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={onContinue}
          disabled={!canContinue}
          className={`
            rounded-full px-6 py-2 text-sm font-medium transition-all duration-150
            ${
              canContinue
                ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 hover:border-emerald-400/60 hover:bg-emerald-400/30"
                : "border border-white/10 bg-white/5 text-white/40"
            }
          `}
        >
          Continue
        </button>
      </div>
    </motion.div>
  );
}

// Add React import for useState
import React from "react";