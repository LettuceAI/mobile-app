import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, AlertCircle, Brain } from "lucide-react";
import type { Model } from "../../../../core/storage/schemas";
import { typography, radius, spacing, interactive, shadows, cn } from "../../../design-tokens";

interface DescriptionStepProps {
  description: string;
  onDescriptionChange: (value: string) => void;
  models: Model[];
  loadingModels: boolean;
  selectedModelId: string | null;
  onSelectModel: (value: string | null) => void;
  onSave: () => void;
  canSave: boolean;
  saving: boolean;
  error: string | null;
}

export function DescriptionStep({
  description,
  onDescriptionChange,
  models,
  loadingModels,
  selectedModelId,
  onSelectModel,
  onSave,
  canSave,
  saving,
  error,
}: DescriptionStepProps) {
  const selectedModel = models.find((m) => m.id === selectedModelId);
  const wordCount = description.trim().split(/\s+/).filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={spacing.section}
    >
      {/* Title */}
      <div className={spacing.tight}>
        <h2 className={cn(typography.h1.size, typography.h1.weight, "text-white")}>
          Character Details
        </h2>
        <p className={cn(typography.body.size, "text-white/50")}>
          Define personality and behavior
        </p>
      </div>

      {/* Description Textarea */}
      <div className={spacing.field}>
        <div className="flex items-center justify-between">
          <label
            className={cn(
              typography.label.size,
              typography.label.weight,
              typography.label.tracking,
              "uppercase text-white/70"
            )}
          >
            Description *
          </label>
          {description.trim() && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                typography.caption.size,
                typography.caption.weight,
                "text-white/40"
              )}
            >
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </motion.span>
          )}
        </div>
        <div className="relative">
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={8}
            placeholder="Describe personality, speaking style, background, knowledge areas..."
            className={cn(
              "w-full resize-none border bg-black/20 px-4 py-3 text-base leading-relaxed text-white placeholder-white/40 backdrop-blur-xl",
              radius.md,
              interactive.transition.default,
              "focus:bg-black/30 focus:outline-none",
              description.trim()
                ? "border-emerald-400/30 focus:border-emerald-400/40"
                : "border-white/10 focus:border-white/30"
            )}
            autoFocus
          />
          {description.trim() && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="pointer-events-none absolute bottom-3 right-3"
            >
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center",
                  radius.full,
                  "border border-emerald-400/30 bg-emerald-400/15"
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
              </div>
            </motion.div>
          )}
        </div>
        <p className={cn(typography.bodySmall.size, "text-white/40")}>
          Be specific about tone, traits, and conversation style
        </p>
      </div>

      {/* Model Selection */}
      <div className={spacing.field}>
        <label
          className={cn(
            typography.label.size,
            typography.label.weight,
            typography.label.tracking,
            "uppercase text-white/70"
          )}
        >
          AI Model *
        </label>
        {loadingModels ? (
          <div
            className={cn(
              "flex items-center gap-3 border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-xl",
              radius.md
            )}
          >
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
            <span className={cn(typography.body.size, "text-white/60")}>Loading models...</span>
          </div>
        ) : models.length ? (
          <>
            <div className="relative">
              <select
                value={selectedModelId ?? ""}
                onChange={(e) => onSelectModel(e.target.value || null)}
                className={cn(
                  "w-full appearance-none border bg-black/20 px-4 py-3.5 pr-10 text-base text-white backdrop-blur-xl",
                  radius.md,
                  interactive.transition.default,
                  "focus:border-white/30 focus:bg-black/30 focus:outline-none",
                  selectedModelId ? "border-white/20" : "border-white/10"
                )}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id} className="bg-[#0b0b0d] text-white">
                    {model.displayName} · {model.providerLabel}
                  </option>
                ))}
              </select>
              {/* Custom dropdown icon */}
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                <Brain className="h-4 w-4 text-white/40" />
              </div>
            </div>
            {selectedModel && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className={cn(
                  "overflow-hidden border border-blue-400/20 bg-blue-400/5 px-3 py-2 backdrop-blur-xl",
                  radius.md
                )}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={cn(
                      "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center",
                      radius.full,
                      "border border-blue-400/30 bg-blue-400/15"
                    )}
                  >
                    <Brain className="h-3 w-3 text-blue-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(typography.bodySmall.size, "text-blue-100/90")}>
                      <span className="font-medium">{selectedModel.displayName}</span>
                      {" · "}
                      <span className="text-blue-200/60">{selectedModel.providerLabel}</span>
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </>
        ) : (
          <div
            className={cn(
              "border border-amber-400/20 bg-amber-400/10 px-4 py-3 backdrop-blur-xl",
              radius.md
            )}
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
              <div>
                <p className={cn(typography.body.size, typography.h3.weight, "text-amber-200/90")}>
                  No models configured
                </p>
                <p className={cn(typography.bodySmall.size, "mt-1 text-amber-200/70")}>
                  Add a provider in settings first to continue
                </p>
              </div>
            </div>
          </div>
        )}
        <p className={cn(typography.bodySmall.size, "text-white/40")}>
          This model will power the character's responses
        </p>
      </div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              "overflow-hidden border border-red-400/20 bg-red-400/10 px-4 py-3 backdrop-blur-xl",
              radius.md
            )}
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-300" />
              <p className={cn(typography.body.size, "text-red-200")}>{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Button */}
      <div className="pt-2">
        <motion.button
          disabled={!canSave}
          onClick={onSave}
          whileTap={{ scale: canSave ? 0.97 : 1 }}
          className={cn(
            "w-full py-4 text-base font-semibold",
            radius.md,
            interactive.transition.fast,
            canSave
              ? cn(
                  "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
                  shadows.glow,
                  "active:border-emerald-400/60 active:bg-emerald-400/30"
                )
              : "cursor-not-allowed border border-white/5 bg-white/5 text-white/30"
          )}
        >
          {saving ? (
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200/30 border-t-emerald-200" />
              <span>Creating Character...</span>
            </div>
          ) : (
            "Create Character"
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
