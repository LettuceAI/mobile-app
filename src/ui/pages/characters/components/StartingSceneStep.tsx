import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, BookOpen, Check, Sparkles } from "lucide-react";
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
  const [isAdding, setIsAdding] = React.useState(false);

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
    setIsAdding(false);
  };

  const deleteScene = (sceneId: string) => {
    const updatedScenes = scenes.filter((s) => s.id !== sceneId);
    onScenesChange(updatedScenes);

    // Clear default if we're deleting the default scene
    if (defaultSceneId === sceneId) {
      onDefaultSceneIdChange(updatedScenes[0]?.id || null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      addScene();
    }
    if (e.key === "Escape") {
      setIsAdding(false);
      setNewSceneContent("");
    }
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
        <h2 className={cn(typography.h1.size, typography.h1.weight, "text-white")}>
          Starting Scenes
        </h2>
        <p className={cn(typography.body.size, "text-white/50")}>
          Create opening scenarios for your conversations
        </p>
      </div>

      {/* Scene List */}
      <AnimatePresence mode="popLayout">
        {scenes.length > 0 && (
          <motion.div layout className={spacing.item}>
            {/* List Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center",
                    radius.md,
                    "border border-blue-400/30 bg-blue-400/10"
                  )}
                >
                  <BookOpen className="h-3.5 w-3.5 text-blue-300" />
                </div>
                <h3 className={cn(typography.h3.size, typography.h3.weight, "text-white")}>
                  Your Scenes
                </h3>
              </div>
              <span
                className={cn(
                  "px-2 py-0.5",
                  radius.full,
                  "border border-white/10 bg-white/5",
                  typography.caption.size,
                  typography.caption.weight,
                  "text-white/60"
                )}
              >
                {scenes.length}
              </span>
            </div>

            {/* Scenes */}
            <div className={spacing.item}>
              {scenes.map((scene, index) => (
                <motion.div
                  key={scene.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, x: -20 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className={cn(
                    "group relative overflow-hidden border border-white/10 bg-white/5",
                    radius.md,
                    shadows.sm
                  )}
                >
                  {/* Gradient accent for default scene */}
                  {defaultSceneId === scene.id && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-400 to-emerald-600" />
                  )}

                  {/* Scene Header */}
                  <div
                    className={cn(
                      "flex items-center gap-2 border-b border-white/10 bg-white/5 px-3.5 py-2.5",
                      defaultSceneId === scene.id && "pl-4"
                    )}
                  >
                    {/* Scene Number */}
                    <div
                      className={cn(
                        "flex h-6 w-6 flex-shrink-0 items-center justify-center border",
                        radius.md,
                        defaultSceneId === scene.id
                          ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
                          : "border-white/10 bg-white/5 text-white/50",
                        typography.caption.size,
                        typography.h3.weight
                      )}
                    >
                      {index + 1}
                    </div>

                    {/* Default Scene Toggle */}
                    <button
                      onClick={() =>
                        onDefaultSceneIdChange(defaultSceneId === scene.id ? null : scene.id)
                      }
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1",
                        radius.full,
                        "border",
                        typography.caption.size,
                        typography.caption.weight,
                        interactive.transition.default,
                        defaultSceneId === scene.id
                          ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-200"
                          : "border-white/10 bg-white/5 text-white/50 hover:border-white/25 hover:bg-white/10 hover:text-white/70"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-3 w-3 items-center justify-center",
                          radius.full,
                          "border",
                          defaultSceneId === scene.id
                            ? "border-emerald-400 bg-emerald-400"
                            : "border-white/30"
                        )}
                      >
                        {defaultSceneId === scene.id && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                          >
                            <Check className="h-2 w-2 text-white" strokeWidth={3} />
                          </motion.div>
                        )}
                      </div>
                      <span>{defaultSceneId === scene.id ? "Default" : "Set Default"}</span>
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => deleteScene(scene.id)}
                      className={cn(
                        "ml-auto flex h-7 w-7 items-center justify-center",
                        radius.md,
                        "border border-white/10 bg-white/5 text-white/50",
                        interactive.transition.default,
                        "hover:border-red-400/40 hover:bg-red-400/15 hover:text-red-300",
                        interactive.active.scale
                      )}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Scene Content */}
                  <div className={cn("px-4 py-3", defaultSceneId === scene.id && "pl-5")}>
                    <p className={cn(typography.body.size, "leading-relaxed text-white/90")}>
                      {scene.content}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Scene Section */}
      <div className={spacing.item}>
        {!isAdding && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setIsAdding(true)}
            className={cn(
              "group flex w-full items-center gap-3 px-4 py-3",
              radius.md,
              "border border-dashed",
              scenes.length === 0
                ? "border-emerald-400/30 bg-emerald-400/10"
                : "border-white/20 bg-white/5",
              interactive.transition.default,
              scenes.length === 0
                ? "hover:border-emerald-400/50 hover:bg-emerald-400/15"
                : "hover:border-white/30 hover:bg-white/10",
              interactive.active.scale
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center",
                radius.md,
                scenes.length === 0
                  ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-300"
                  : "border border-white/10 bg-white/10 text-white/60 group-hover:border-white/25 group-hover:text-white/80",
                interactive.transition.default
              )}
            >
              {scenes.length === 0 ? <Sparkles className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </div>
            <div className="flex-1 text-left">
              <p
                className={cn(
                  typography.h3.size,
                  typography.h3.weight,
                  scenes.length === 0 ? "text-emerald-100" : "text-white"
                )}
              >
                {scenes.length === 0 ? "Add Your First Scene" : "Add Another Scene"}
              </p>
              <p className={cn(typography.bodySmall.size, "text-white/50")}>
                {scenes.length === 0 ? "Required to continue" : "Optional"}
              </p>
            </div>
          </motion.button>
        )}

        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={spacing.field}
          >
            <label
              className={cn(
                typography.label.size,
                typography.label.weight,
                typography.label.tracking,
                "uppercase text-white/70"
              )}
            >
              Scene Description *
            </label>
            <textarea
              value={newSceneContent}
              onChange={(e) => setNewSceneContent(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Describe the setting, scenario, and context for this scene. For example: 'You are both students at a magical academy...' or 'It's a quiet evening in a cozy café...'"
              className={cn(
                "min-h-[140px] w-full resize-none border border-white/10 bg-black/20 px-4 py-3 text-base leading-relaxed text-white placeholder-white/40 backdrop-blur-xl",
                radius.md,
                interactive.transition.default,
                "focus:border-white/30 focus:bg-black/30 focus:outline-none"
              )}
              rows={6}
              autoFocus
            />
            <div className="flex items-center justify-between gap-3">
              <p className={cn(typography.bodySmall.size, "text-white/50")}>
                Press Ctrl+Enter to add • Esc to cancel
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewSceneContent("");
                  }}
                  className={cn(
                    "flex-1 px-4 py-2.5",
                    radius.md,
                    "border border-white/10 bg-white/5",
                    typography.bodySmall.size,
                    typography.h3.weight,
                    "text-white/70",
                    interactive.transition.default,
                    "active:scale-[0.97] active:bg-white/10"
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={addScene}
                  disabled={!newSceneContent.trim()}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 px-4 py-2.5",
                    radius.md,
                    typography.bodySmall.size,
                    typography.h3.weight,
                    interactive.transition.default,
                    newSceneContent.trim()
                      ? cn(
                          "border border-blue-400/40 bg-blue-400/20 text-blue-100",
                          "active:scale-[0.97] active:bg-blue-400/30"
                        )
                      : "cursor-not-allowed border border-white/5 bg-white/5 text-white/30"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  Add Scene
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

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