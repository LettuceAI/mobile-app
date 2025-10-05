import { motion, AnimatePresence } from "framer-motion";
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
          Character Description
        </h2>
        <p className={cn(typography.body.size, "text-white/50")}>
          Define personality and behavior
        </p>
      </div>

      {/* Description Textarea */}
      <div className={spacing.field}>
        <label
          className={cn(
            typography.label.size,
            typography.label.weight,
            typography.label.tracking,
            "uppercase text-white/70"
          )}
        >
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={7}
          placeholder="Describe personality, speaking style, background, knowledge areas..."
          className={cn(
            "w-full resize-none border border-white/10 bg-black/20 px-4 py-3 leading-relaxed text-white placeholder-white/40 backdrop-blur-xl",
            radius.md,
            typography.body.size,
            interactive.transition.default,
            "focus:border-white/30 focus:bg-black/30 focus:outline-none"
          )}
          autoFocus
        />
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
          AI Model
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
          <select
            value={selectedModelId ?? ""}
            onChange={(e) => onSelectModel(e.target.value || null)}
            className={cn(
              "w-full border border-white/10 bg-black/20 px-4 py-3 text-white backdrop-blur-xl",
              radius.md,
              typography.body.size,
              interactive.transition.default,
              "focus:border-white/30 focus:bg-black/30 focus:outline-none"
            )}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id} className="bg-[#0b0b0d] text-white">
                {model.displayName} · {model.providerLabel}
              </option>
            ))}
          </select>
        ) : (
          <div
            className={cn(
              "border border-amber-400/20 bg-amber-400/10 px-4 py-3 backdrop-blur-xl",
              radius.md
            )}
          >
            <p className={cn(typography.body.size, "text-amber-200/90")}>
              No models configured. Add a provider in settings first.
            </p>
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
            <p className={cn(typography.body.size, "text-red-200")}>{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Button */}
      <div className="pt-4">
        <motion.button
          disabled={!canSave}
          onClick={onSave}
          whileTap={{ scale: canSave ? 0.98 : 1 }}
          className={cn(
            "w-full py-3.5",
            radius.md,
            typography.body.size,
            typography.h3.weight,
            interactive.transition.fast,
            canSave
              ? cn(
                  "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
                  shadows.glow,
                  "hover:border-emerald-400/60 hover:bg-emerald-400/30"
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
