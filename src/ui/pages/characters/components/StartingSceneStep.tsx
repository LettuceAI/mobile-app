import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X, BookOpen, Edit2, ChevronDown, EyeOff } from "lucide-react";
import type { Scene } from "../../../../core/storage/schemas";
import { typography, radius, spacing, interactive, shadows, cn } from "../../../design-tokens";
import { BottomMenu } from "../../../components/BottomMenu";

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
  const [newSceneDirection, setNewSceneDirection] = React.useState("");
  const [showNewDirectionInput, setShowNewDirectionInput] = React.useState(false);
  const [editingSceneId, setEditingSceneId] = React.useState<string | null>(null);
  const [editingSceneContent, setEditingSceneContent] = React.useState("");
  const [editingSceneDirection, setEditingSceneDirection] = React.useState("");
  const [editDirectionExpanded, setEditDirectionExpanded] = React.useState(false);
  const [expandedSceneId, setExpandedSceneId] = React.useState<string | null>(null);

  const addScene = () => {
    if (!newSceneContent.trim()) return;

    const sceneId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const timestamp = Date.now();

    const newScene: Scene = {
      id: sceneId,
      content: newSceneContent.trim(),
      direction: newSceneDirection.trim() || undefined,
      createdAt: timestamp,
    };

    const updatedScenes = [...scenes, newScene];
    onScenesChange(updatedScenes);

    if (updatedScenes.length === 1) {
      onDefaultSceneIdChange(sceneId);
    }

    setNewSceneContent("");
    setNewSceneDirection("");
    setShowNewDirectionInput(false);
  };

  const deleteScene = (sceneId: string) => {
    const updatedScenes = scenes.filter((s) => s.id !== sceneId);
    onScenesChange(updatedScenes);

    if (defaultSceneId === sceneId) {
      onDefaultSceneIdChange(
        updatedScenes.length === 1 ? updatedScenes[0].id : updatedScenes[0]?.id || null,
      );
    }
  };

  const startEditingScene = (scene: Scene) => {
    setEditingSceneId(scene.id);
    setEditingSceneContent(scene.content);
    setEditingSceneDirection(scene.direction || "");
    setEditDirectionExpanded(Boolean(scene.direction));
  };

  const saveEditedScene = () => {
    if (!editingSceneId || !editingSceneContent.trim()) return;

    const updatedScenes = scenes.map((scene) =>
      scene.id === editingSceneId
        ? {
            ...scene,
            content: editingSceneContent.trim(),
            direction: editingSceneDirection.trim() || undefined,
          }
        : scene,
    );
    onScenesChange(updatedScenes);

    setEditingSceneId(null);
    setEditingSceneContent("");
    setEditingSceneDirection("");
    setEditDirectionExpanded(false);
  };

  const cancelEditingScene = () => {
    setEditingSceneId(null);
    setEditingSceneContent("");
    setEditingSceneDirection("");
    setEditDirectionExpanded(false);
  };

  return (
    <div className={cn(spacing.section, "flex flex-col flex-1 min-h-0")}>
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
      <div className={cn(spacing.item, "space-y-2")}>
        <AnimatePresence initial={false}>
          {scenes.map((scene, index) => {
            const isEditing = editingSceneId === scene.id;
            const isDefault = defaultSceneId === scene.id;
            const isExpanded = expandedSceneId === scene.id || isEditing;

            return (
              <motion.div
                key={scene.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className={cn(
                  "overflow-hidden rounded-xl border transition-colors duration-150",
                  isDefault
                    ? "border-emerald-400/30 bg-emerald-400/5"
                    : "border-white/10 bg-white/5",
                )}
              >
                {/* Scene Header - clickable to expand/collapse */}
                <button
                  onClick={() => !isEditing && setExpandedSceneId(isExpanded ? null : scene.id)}
                  className={cn(
                    "flex w-full items-center gap-2 border-b px-3.5 py-2.5 text-left transition-colors duration-150",
                    isDefault
                      ? "border-emerald-400/20 bg-emerald-400/10"
                      : "border-white/10 bg-white/5",
                  )}
                >
                  {/* Scene number badge */}
                  <div
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs font-medium",
                      isDefault
                        ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-300"
                        : "border-white/10 bg-white/5 text-white/60",
                    )}
                  >
                    {index + 1}
                  </div>

                  {/* Default badge */}
                  {isDefault && (
                    <div className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/20 px-2 py-0.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span className="text-[10px] font-medium text-emerald-200">Default</span>
                    </div>
                  )}

                  {/* Direction indicator */}
                  {scene.direction && (
                    <div
                      className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5"
                      title="Has scene direction"
                    >
                      <EyeOff className="h-3 w-3 text-white/40" />
                    </div>
                  )}

                  {/* Preview text when collapsed */}
                  {!isExpanded && !isEditing && (
                    <span className="flex-1 truncate text-sm text-white/50">
                      {scene.content.slice(0, 50)}
                      {scene.content.length > 50 ? "..." : ""}
                    </span>
                  )}

                  {/* Expand indicator */}
                  {!isEditing && (
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-white/40 ml-auto transition-transform duration-150",
                        isExpanded && "rotate-180",
                      )}
                    />
                  )}
                </button>

                {/* Scene Content */}
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out",
                    isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="p-3.5">
                      <div className="space-y-3">
                        <p className="text-sm leading-relaxed text-white/90">{scene.content}</p>

                        {/* Scene Direction */}
                        {scene.direction && (
                          <div className="pt-2 border-t border-white/5">
                            <p className="text-[10px] font-medium text-white/40 mb-1">
                              Scene Direction
                            </p>
                            <p className="text-xs leading-relaxed text-white/50 italic">
                              {scene.direction}
                            </p>
                          </div>
                        )}

                        {/* Actions when expanded */}
                        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                          {!isDefault && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDefaultSceneIdChange(scene.id);
                              }}
                              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/60 transition active:scale-95 active:bg-white/10"
                            >
                              Set as Default
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingScene(scene);
                            }}
                            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/60 transition active:scale-95 active:bg-white/10"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteScene(scene.id);
                            }}
                            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/50 transition active:bg-red-400/10 active:text-red-400"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Add New Scene */}
      <div className={spacing.item}>
        <textarea
          value={newSceneContent}
          onChange={(e) => setNewSceneContent(e.target.value)}
          rows={6}
          placeholder="Create a starting scene or scenario for roleplay (e.g., 'You find yourself in a mystical forest at twilight...')"
          className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm leading-relaxed text-white placeholder-white/40 transition focus:border-white/25 focus:outline-none"
        />
        <div className="flex items-center justify-between mt-1">
          {!showNewDirectionInput && !newSceneDirection ? (
            <button
              type="button"
              onClick={() => setShowNewDirectionInput(true)}
              className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/60 transition"
            >
              <EyeOff className="h-3 w-3" />+ Add Direction
            </button>
          ) : (
            <span className="text-[11px] text-white/40">Direction added</span>
          )}
          <span className="text-[11px] text-white/40">{wordCount(newSceneContent)} words</span>
        </div>

        {/* Scene Direction Input - CSS grid for smooth height */}
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-150 ease-out",
            showNewDirectionInput || newSceneDirection ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-white/50">
                  <EyeOff className="h-3 w-3" />
                  Scene Direction
                </span>
                {!newSceneDirection && (
                  <button
                    type="button"
                    onClick={() => setShowNewDirectionInput(false)}
                    className="text-[11px] text-white/40 hover:text-white/60"
                  >
                    Cancel
                  </button>
                )}
              </div>
              <textarea
                value={newSceneDirection}
                onChange={(e) => setNewSceneDirection(e.target.value)}
                rows={2}
                placeholder="e.g., 'The hostage will be rescued' or 'Maintain tense atmosphere'"
                className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-white placeholder-white/30 transition focus:border-white/20 focus:outline-none"
              />
              <p className="text-[10px] text-white/30">
                Hidden guidance for the AI on how this scene should unfold
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={addScene}
          disabled={!newSceneContent.trim()}
          className={cn(
            "mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition active:scale-[0.98]",
            newSceneContent.trim()
              ? "border border-blue-400/40 bg-blue-400/20 text-blue-100 active:bg-blue-400/30"
              : "border border-white/10 bg-white/5 text-white/40",
          )}
        >
          <Plus className="h-4 w-4" />
          Add Scene
        </button>
      </div>

      {/* Continue Button - moved to bottom */}
      <div className="pt-4 mt-auto space-y-3">
        <p className="text-xs text-white/50 text-center">
          Create multiple starting scenarios. One will be selected when starting a new chat.
        </p>
        <button
          disabled={!canContinue}
          onClick={onContinue}
          className={cn(
            "w-full py-4 text-base font-semibold transition active:scale-[0.98]",
            radius.md,
            interactive.transition.fast,
            canContinue
              ? cn(
                  "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
                  shadows.glow,
                  "active:border-emerald-400/60 active:bg-emerald-400/30",
                )
              : "cursor-not-allowed border border-white/5 bg-white/5 text-white/30",
          )}
        >
          Continue to Details
        </button>
      </div>

      {/* Edit Scene Bottom Menu */}
      <BottomMenu isOpen={editingSceneId !== null} onClose={cancelEditingScene} title="Edit Scene">
        <div className="space-y-4">
          {/* Scene Content */}
          <div>
            <textarea
              value={editingSceneContent}
              onChange={(e) => setEditingSceneContent(e.target.value)}
              rows={10}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-relaxed text-white placeholder-white/40 transition focus:border-white/20 focus:outline-none"
              placeholder="Enter scene content..."
            />
            <div className="mt-1 flex justify-end text-[11px] text-white/40">
              {wordCount(editingSceneContent)} words
            </div>
          </div>

          {/* Scene Direction - Collapsible */}
          <div className="border-t border-white/10 pt-3">
            {!editDirectionExpanded && !editingSceneDirection ? (
              <button
                type="button"
                onClick={() => setEditDirectionExpanded(true)}
                className="flex w-full items-center justify-between py-1"
              >
                <span className="flex items-center gap-1.5 text-xs font-medium text-white/50">
                  <EyeOff className="h-3 w-3" />
                  Scene Direction
                </span>
                <span className="text-[11px] text-white/40">+ Add</span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-white/50">
                    <EyeOff className="h-3 w-3" />
                    Scene Direction
                  </span>
                  {!editingSceneDirection && (
                    <button
                      type="button"
                      onClick={() => setEditDirectionExpanded(false)}
                      className="text-[11px] text-white/40 hover:text-white/60"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <textarea
                  value={editingSceneDirection}
                  onChange={(e) => setEditingSceneDirection(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-white placeholder-white/30 transition focus:border-white/20 focus:outline-none"
                  placeholder="e.g., 'The hostage will be rescued' or 'Build tension gradually'"
                />
                <p className="text-[10px] text-white/30">
                  Hidden guidance for the AI on how this scene should unfold
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={cancelEditingScene}
              className={cn(
                "flex-1 py-3 text-sm font-medium text-white/70 transition",
                "border border-white/10 bg-white/5",
                "hover:bg-white/10 hover:text-white",
                "active:scale-[0.98]",
                radius.lg,
              )}
            >
              Cancel
            </button>
            <button
              onClick={saveEditedScene}
              disabled={!editingSceneContent.trim()}
              className={cn(
                "flex-1 py-3 text-sm font-semibold text-white transition",
                "bg-gradient-to-r from-emerald-500 to-green-500",
                "hover:from-emerald-400 hover:to-green-400",
                "active:scale-[0.98]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                radius.lg,
              )}
            >
              Save
            </button>
          </div>
        </div>
      </BottomMenu>
    </div>
  );
}

const wordCount = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};
