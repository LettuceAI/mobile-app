import { motion } from "framer-motion";
import { radius, interactive, typography, spacing, cn } from "../../../design-tokens";

interface ExtrasStepProps {
  nickname: string;
  onNicknameChange: (value: string) => void;
  creator: string;
  onCreatorChange: (value: string) => void;
  creatorNotes: string;
  onCreatorNotesChange: (value: string) => void;
  creatorNotesMultilingualText: string;
  onCreatorNotesMultilingualTextChange: (value: string) => void;
  tagsText: string;
  onTagsTextChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}

export function ExtrasStep({
  nickname,
  onNicknameChange,
  creator,
  onCreatorChange,
  creatorNotes,
  onCreatorNotesChange,
  creatorNotesMultilingualText,
  onCreatorNotesMultilingualTextChange,
  tagsText,
  onTagsTextChange,
  onSave,
  saving,
  error,
}: ExtrasStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={spacing.section}
    >
      <div className={spacing.tight}>
        <h2 className={cn(typography.h1.size, typography.h1.weight, "text-white")}>
          Extra Details
        </h2>
        <p className={cn(typography.body.size, "text-white/50")}>All fields are optional</p>
      </div>

      <div className={spacing.field}>
        <label
          className={cn(typography.label.size, typography.label.weight, "uppercase text-white/70")}
        >
          Nickname
        </label>
        <input
          value={nickname}
          onChange={(e) => onNicknameChange(e.target.value)}
          placeholder="Optional nickname..."
          className={cn(
            "w-full border bg-black/20 px-4 py-3 text-base text-white placeholder-white/40",
            radius.md,
            interactive.transition.default,
            "focus:border-white/30 focus:outline-none",
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className={spacing.field}>
          <label
            className={cn(
              typography.label.size,
              typography.label.weight,
              "uppercase text-white/70",
            )}
          >
            Creator
          </label>
          <input
            value={creator}
            onChange={(e) => onCreatorChange(e.target.value)}
            placeholder="Optional creator name..."
            className={cn(
              "w-full border bg-black/20 px-4 py-3 text-base text-white placeholder-white/40",
              radius.md,
              interactive.transition.default,
              "focus:border-white/30 focus:outline-none",
            )}
          />
        </div>
        <div className={spacing.field}>
          <label
            className={cn(
              typography.label.size,
              typography.label.weight,
              "uppercase text-white/70",
            )}
          >
            Tags
          </label>
          <input
            value={tagsText}
            onChange={(e) => onTagsTextChange(e.target.value)}
            placeholder="tag1, tag2"
            className={cn(
              "w-full border bg-black/20 px-4 py-3 text-base text-white placeholder-white/40",
              radius.md,
              interactive.transition.default,
              "focus:border-white/30 focus:outline-none",
            )}
          />
        </div>
      </div>

      <div className={spacing.field}>
        <label
          className={cn(typography.label.size, typography.label.weight, "uppercase text-white/70")}
        >
          Creator Notes
        </label>
        <textarea
          value={creatorNotes}
          onChange={(e) => onCreatorNotesChange(e.target.value)}
          rows={3}
          placeholder="Optional creator notes..."
          className={cn(
            "w-full resize-none border bg-black/20 px-4 py-3 text-base text-white placeholder-white/40",
            radius.md,
            interactive.transition.default,
            "focus:border-white/30 focus:outline-none",
          )}
        />
      </div>

      <div className={spacing.field}>
        <label
          className={cn(typography.label.size, typography.label.weight, "uppercase text-white/70")}
        >
          Creator Notes Multilingual (JSON)
        </label>
        <textarea
          value={creatorNotesMultilingualText}
          onChange={(e) => onCreatorNotesMultilingualTextChange(e.target.value)}
          rows={4}
          placeholder='{"en":"note","ja":"メモ"}'
          className={cn(
            "w-full resize-none border bg-black/20 px-4 py-3 text-sm text-white placeholder-white/40",
            radius.md,
            interactive.transition.default,
            "font-mono focus:border-white/30 focus:outline-none",
          )}
        />
      </div>

      {error && (
        <div
          className={cn("rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3", radius.md)}
        >
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      <div className="pt-2">
        <motion.button
          disabled={saving}
          onClick={onSave}
          whileTap={{ scale: saving ? 1 : 0.97 }}
          className={cn(
            "w-full py-4 text-base font-semibold",
            radius.md,
            interactive.transition.fast,
            saving
              ? "cursor-not-allowed border border-white/5 bg-white/5 text-white/30"
              : "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
          )}
        >
          {saving ? "Creating Character..." : "Create Character"}
        </motion.button>
      </div>
    </motion.div>
  );
}
