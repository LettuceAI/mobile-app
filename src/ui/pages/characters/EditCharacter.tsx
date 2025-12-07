import React from "react";
import { useParams } from "react-router-dom";
import { Save, Loader2, Plus, X, Sparkles, BookOpen, Cpu, Image, Download, Layers, Edit2, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEditCharacterForm } from "./hooks/useEditCharacterForm";
import { AvatarPicker } from "../../components/AvatarPicker";
import { BottomMenu } from "../../components/BottomMenu";
import { cn, radius } from "../../design-tokens";

const wordCount = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};

export function EditCharacterPage() {
  const { characterId } = useParams();
  const { state, actions, computed } = useEditCharacterForm(characterId);
  const [expandedSceneId, setExpandedSceneId] = React.useState<string | null>(null);

  const {
    loading,
    saving,
    exporting,
    error,
    name,
    description,
    avatarPath,
    backgroundImagePath,
    scenes,
    defaultSceneId,
    newSceneContent,
    selectedModelId,

    disableAvatarGradient,
    customGradientEnabled,
    customGradientColors,
    customTextColor: _customTextColor,
    customTextSecondary: _customTextSecondary,
    memoryType,
    dynamicMemoryEnabled,
    models,
    loadingModels,

    editingSceneId,
    editingSceneContent,
  } = state;

  const {
    setFields,
    handleSave,
    handleExport,
    addScene,
    deleteScene,
    startEditingScene,
    saveEditedScene,
    cancelEditingScene,
    handleBackgroundImageUpload,
  } = actions;

  const { avatarInitial, canSave } = computed;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
      </div>
    );
  }

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
          <div className="rounded-2xl border border-white/10 bg-linear-to-br from-white/5 to-white/2">
            <div className="flex items-center gap-4 p-4">
              {/* Avatar */}
              <div className="relative h-16 w-16 shrink-0">
                <AvatarPicker
                  currentAvatarPath={avatarPath}
                  onAvatarChange={(path) => setFields({ avatarPath: path })}
                  size="sm"
                  placeholder={avatarInitial}
                />
                {/* Remove avatar button */}
                {avatarPath && (
                  <button
                    onClick={() => setFields({ avatarPath: "" })}
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
                  onChange={(e) => setFields({ name: e.target.value })}
                  placeholder="Character name..."
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-base text-white placeholder-white/40 transition focus:border-white/25 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Avatar Gradient Toggle */}
          {avatarPath && (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 transition hover:bg-black/30">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <p className="text-sm font-medium text-white">Avatar Gradient</p>
                  </div>
                  <p className="mt-0.5 text-xs text-white/50">
                    Generate colorful gradients from avatar colors
                  </p>
                </div>
                <div className="relative ml-3">
                  <input
                    type="checkbox"
                    checked={!disableAvatarGradient}
                    onChange={(e) => setFields({ disableAvatarGradient: !e.target.checked })}
                    className="peer sr-only"
                  />
                  <div className="h-6 w-11 rounded-full bg-white/20 transition peer-checked:bg-emerald-500/80"></div>
                  <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5"></div>
                </div>
              </label>
            </div>
          )}

          {/* Custom Gradient Override */}
          {avatarPath && (
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-400" />
                      <p className="text-sm font-medium text-white">Custom Gradient</p>
                    </div>
                    <p className="mt-0.5 text-xs text-white/50">
                      Override auto-detected colors with your own
                    </p>
                  </div>
                  <label className="relative ml-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customGradientEnabled}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Enable - set default colors if none exist
                          const colors = customGradientColors.length > 0
                            ? customGradientColors
                            : ["#4f46e5", "#7c3aed"];
                          setFields({ customGradientEnabled: true, customGradientColors: colors });
                        } else {
                          // Disable but preserve colors
                          setFields({ customGradientEnabled: false });
                        }
                      }}
                      className="peer sr-only"
                    />
                    <div className="h-6 w-11 rounded-full bg-white/20 transition peer-checked:bg-purple-500/80"></div>
                    <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5"></div>
                  </label>
                </div>

                {/* Color Pickers - shown when custom gradient enabled */}
                {customGradientEnabled && (
                  <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                    {/* Gradient Preview */}
                    <div
                      className="h-16 w-full rounded-lg"
                      style={{
                        background: customGradientColors.length >= 3
                          ? `linear-gradient(135deg, ${customGradientColors[0]}, ${customGradientColors[2]}, ${customGradientColors[1]})`
                          : customGradientColors.length >= 2
                            ? `linear-gradient(135deg, ${customGradientColors[0]}, ${customGradientColors[1]})`
                            : customGradientColors[0]
                      }}
                    />

                    {/* Color 1 */}
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-white/50 w-12">Start</label>
                      <div className="relative shrink-0">
                        <input
                          type="color"
                          value={customGradientColors[0] || "#4f46e5"}
                          onChange={(e) => {
                            const newColors = [...customGradientColors];
                            newColors[0] = e.target.value;
                            setFields({ customGradientColors: newColors });
                          }}
                          className="h-10 w-10 cursor-pointer rounded-lg border-2 border-white/20 p-0.5"
                          style={{ backgroundColor: customGradientColors[0] || "#4f46e5" }}
                        />
                      </div>
                      <input
                        type="text"
                        value={customGradientColors[0] || ""}
                        onChange={(e) => {
                          const newColors = [...customGradientColors];
                          newColors[0] = e.target.value;
                          setFields({ customGradientColors: newColors });
                        }}
                        placeholder="#4f46e5"
                        className="flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm font-mono text-white placeholder:text-white/30 focus:border-purple-500/50 focus:outline-none"
                      />
                    </div>

                    {/* Middle Color (optional) */}
                    {customGradientColors.length >= 3 ? (
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-white/50 w-12">Mid</label>
                        <div className="relative shrink-0">
                          <input
                            type="color"
                            value={customGradientColors[2] || "#a855f7"}
                            onChange={(e) => {
                              const newColors = [...customGradientColors];
                              newColors[2] = e.target.value;
                              setFields({ customGradientColors: newColors });
                            }}
                            className="h-10 w-10 cursor-pointer rounded-lg border-2 border-white/20 p-0.5"
                            style={{ backgroundColor: customGradientColors[2] || "#a855f7" }}
                          />
                        </div>
                        <input
                          type="text"
                          value={customGradientColors[2] || ""}
                          onChange={(e) => {
                            const newColors = [...customGradientColors];
                            newColors[2] = e.target.value;
                            setFields({ customGradientColors: newColors });
                          }}
                          placeholder="#a855f7"
                          className="flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm font-mono text-white placeholder:text-white/30 focus:border-purple-500/50 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            // Remove middle color - reorder so End stays at index 1
                            const newColors = [customGradientColors[0], customGradientColors[1]];
                            setFields({ customGradientColors: newColors });
                          }}
                          className="shrink-0 text-xs text-red-400 hover:text-red-300"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          // Add middle color between Start and End
                          const newColors = [customGradientColors[0], customGradientColors[1], "#a855f7"];
                          setFields({ customGradientColors: newColors });
                        }}
                        className="text-xs text-purple-400 hover:text-purple-300 py-1"
                      >
                        + Add middle color
                      </button>
                    )}

                    {/* Color 2 (End) */}
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-white/50 w-12">End</label>
                      <div className="relative shrink-0">
                        <input
                          type="color"
                          value={customGradientColors[1] || "#7c3aed"}
                          onChange={(e) => {
                            const newColors = [...customGradientColors];
                            newColors[1] = e.target.value;
                            setFields({ customGradientColors: newColors });
                          }}
                          className="h-10 w-10 cursor-pointer rounded-lg border-2 p-0.5"
                          style={{ backgroundColor: customGradientColors[1] || "#7c3aed" }}
                        />
                      </div>
                      <input
                        type="text"
                        value={customGradientColors[1] || ""}
                        onChange={(e) => {
                          const newColors = [...customGradientColors];
                          newColors[1] = e.target.value;
                          setFields({ customGradientColors: newColors });
                        }}
                        placeholder="#7c3aed"
                        className="flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm font-mono text-white placeholder:text-white/30 focus:border-purple-500/50 focus:outline-none"
                      />
                    </div>

                    {/* Optional: Text color override hint */}
                    <p className="text-[10px] text-white/40 mt-2">
                      Text colors are auto-calculated based on gradient brightness
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

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
                    onClick={() => setFields({ backgroundImagePath: "" })}
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
              onChange={(e) => setFields({ description: e.target.value })}
              rows={8}
              placeholder="Describe who this character is, their personality, background, speaking style, and how they should interact..."
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm leading-relaxed text-white placeholder-white/40 transition focus:border-white/25 focus:outline-none"
            />
            <div className="flex justify-end text-[11px] text-white/40">
              {wordCount(description)} words
            </div>
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
                <motion.div layout className="space-y-2">
                  {scenes.map((scene, index) => {
                    const isDefault = defaultSceneId === scene.id;
                    const isExpanded = expandedSceneId === scene.id;

                    return (
                      <motion.div
                        key={scene.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, x: -20 }}
                        transition={{ duration: 0.15 }}
                        className={`overflow-hidden rounded-xl border ${isDefault
                          ? "border-emerald-400/30 bg-emerald-400/5"
                          : "border-white/10 bg-white/5"
                          }`}
                      >
                        {/* Scene Header - clickable to expand/collapse */}
                        <button
                          onClick={() => setExpandedSceneId(isExpanded ? null : scene.id)}
                          className={`flex w-full items-center gap-2 border-b px-3.5 py-2.5 text-left ${isDefault
                            ? "border-emerald-400/20 bg-emerald-400/10"
                            : "border-white/10 bg-white/5"
                            }`}
                        >
                          {/* Scene number badge */}
                          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs font-medium ${isDefault
                            ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-300"
                            : "border-white/10 bg-white/5 text-white/60"
                            }`}>
                            {index + 1}
                          </div>

                          {/* Default badge */}
                          {isDefault && (
                            <div className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/20 px-2 py-0.5">
                              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              <span className="text-[10px] font-medium text-emerald-200">Default</span>
                            </div>
                          )}

                          {/* Preview text when collapsed */}
                          {!isExpanded && (
                            <span className="flex-1 truncate text-sm text-white/50">
                              {scene.content.slice(0, 50)}{scene.content.length > 50 ? "..." : ""}
                            </span>
                          )}

                          {/* Expand indicator */}
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-white/40 transition-transform ml-auto",
                              isExpanded && "rotate-180"
                            )}
                          />
                        </button>

                        {/* Scene Content - collapsible */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="p-3.5">
                                <div className="space-y-3">
                                  <p className="text-sm leading-relaxed text-white/90">{scene.content}</p>

                                  {/* Actions when expanded */}
                                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                                    {!isDefault && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setFields({ defaultSceneId: scene.id });
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
                            </motion.div>
                          )}
                        </AnimatePresence>
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
                onChange={(e) => setFields({ newSceneContent: e.target.value })}
                rows={5}
                placeholder="Create a starting scene or scenario for roleplay (e.g., 'You find yourself in a mystical forest at twilight...')"
                className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm leading-relaxed text-white placeholder-white/40 transition focus:border-white/25 focus:outline-none min-h-[140px] max-h-[320px] overflow-auto"
              />
              <div className="flex justify-end text-[11px] text-white/40">
                {wordCount(newSceneContent)} words
              </div>
              <motion.button
                onClick={addScene}
                disabled={!newSceneContent.trim()}
                whileTap={{ scale: newSceneContent.trim() ? 0.97 : 1 }}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${newSceneContent.trim()
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
                onChange={(e) => setFields({ selectedModelId: e.target.value || null })}
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

          {/* Memory Mode */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-1.5">
                <Layers className="h-4 w-4 text-amber-300" />
              </div>
              <h3 className="text-sm font-semibold text-white">Memory Mode</h3>
              {!dynamicMemoryEnabled && (
                <span className="ml-auto text-xs text-white/40">Enable Dynamic Memory to switch</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFields({ memoryType: "manual" })}
                className={`rounded-xl border px-3.5 py-3 text-left transition ${memoryType === "manual"
                  ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-50 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
                  : "border-white/10 bg-black/20 text-white/70 hover:border-white/20 hover:bg-black/30"
                  }`}
              >
                <p className="text-sm font-semibold">Manual Memory</p>
                <p className="mt-1 text-xs text-white/60">Manage notes yourself (current system).</p>
              </button>
              <button
                disabled={!dynamicMemoryEnabled}
                onClick={() => dynamicMemoryEnabled && setFields({ memoryType: "dynamic" })}
                className={`rounded-xl border px-3.5 py-3 text-left transition ${memoryType === "dynamic" && dynamicMemoryEnabled
                  ? "border-blue-400/50 bg-blue-500/20 text-blue-50 shadow-[0_0_0_1px_rgba(96,165,250,0.3)]"
                  : "border-white/10 bg-black/15 text-white/60"
                  } ${!dynamicMemoryEnabled ? "cursor-not-allowed opacity-50" : "hover:border-white/20 hover:bg-black/25"}`}
              >
                <p className="text-sm font-semibold">Dynamic Memory</p>
                <p className="mt-1 text-xs text-white/60">Automatic summaries when enabled globally.</p>
              </button>
            </div>
            <p className="text-xs text-white/50">
              Dynamic Memory must be turned on in Advanced settings; otherwise manual memory is used.
            </p>
          </div>



          {/* Save Button */}
          <motion.button
            onClick={handleSave}
            disabled={!canSave}
            whileTap={{ scale: canSave ? 0.98 : 1 }}
            className={`w-full rounded-xl px-4 py-3.5 text-sm font-semibold transition ${canSave
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

          {/* Export Button */}
          <motion.button
            onClick={handleExport}
            disabled={exporting}
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
                Export Character
              </span>
            )}
          </motion.button>
        </motion.div>
      </main>

      {/* Edit Scene Bottom Menu */}
      <BottomMenu
        isOpen={editingSceneId !== null}
        onClose={cancelEditingScene}
        title="Edit Scene"
      >
        <div className="space-y-4">
          <textarea
            value={editingSceneContent}
            onChange={(e) => setFields({ editingSceneContent: e.target.value })}
            rows={12}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-relaxed text-white placeholder-white/40 transition focus:border-white/20 focus:outline-none"
            placeholder="Enter scene content..."
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">
              {wordCount(editingSceneContent)} words
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={cancelEditingScene}
              className={cn(
                "flex-1 py-3 text-sm font-medium text-white/70 transition",
                "border border-white/10 bg-white/5",
                "hover:bg-white/10 hover:text-white",
                "active:scale-[0.98]",
                radius.lg
              )}
            >
              Cancel
            </button>
            <button
              onClick={saveEditedScene}
              disabled={!editingSceneContent.trim()}
              className={cn(
                "flex-1 py-3 text-sm font-semibold text-white transition",
                "bg-emerald-500",
                "hover:bg-emerald-400",
                "active:scale-[0.98]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                radius.lg
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
