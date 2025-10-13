import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { typography, radius, spacing, interactive, shadows, cn } from "../../../design-tokens";

interface IdentityStepProps {
  name: string;
  onNameChange: (value: string) => void;
  avatarPath: string;
  onAvatarChange: (value: string) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onContinue: () => void;
  canContinue: boolean;
  avatarPreview: ReactNode;
}

export function IdentityStep({
  name,
  onNameChange,
  avatarPath,
  onAvatarChange,
  onUpload,
  onContinue,
  canContinue,
  avatarPreview,
}: IdentityStepProps) {
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
          Create Character
        </h2>
        <p className={cn(typography.body.size, "text-white/50")}>
          Give your AI character an identity
        </p>
      </div>

      {/* Avatar Section */}
      <div className="relative flex flex-col items-center gap-3 py-4">
        {/* Background glow effect */}
        {avatarPath && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="h-24 w-24 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 blur-3xl" />
          </motion.div>
        )}

        <div className="relative z-10">
          <motion.div
            whileTap={{ scale: 0.97 }}
            className={cn(
              "relative h-24 w-24 overflow-hidden border-2",
              radius.full,
              avatarPath ? "border-white/20" : "border-white/10",
              "bg-gradient-to-br from-white/5 to-white/10",
              shadows.lg,
              interactive.transition.default
            )}
          >
            {avatarPreview}

            {/* Upload overlay */}
            {!avatarPath && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                <Sparkles className="h-7 w-7 text-white/30" />
              </div>
            )}
          </motion.div>

          {/* Upload Button */}
          <label
            className={cn(
              "group absolute -bottom-1 -right-1 z-20 flex h-10 w-10 cursor-pointer items-center justify-center border-2 border-[#050505] text-white/60",
              radius.full,
              avatarPath ? "bg-purple-500/20" : "bg-[#0b0b0d]",
              shadows.lg,
              interactive.transition.default,
              "active:scale-95",
              "active:bg-purple-500/30"
            )}
          >
            <Camera size={17} />
            <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
          </label>

          {/* Remove Button */}
          <AnimatePresence>
            {avatarPath && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={() => onAvatarChange("")}
                className={cn(
                  "absolute -top-1 -left-1 z-20 flex h-7 w-7 items-center justify-center border-2 border-[#050505] bg-red-400/20 text-red-300",
                  radius.full,
                  shadows.lg,
                  interactive.transition.default,
                  "active:scale-95 active:bg-red-400/30"
                )}
              >
                <X size={13} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <motion.p
          key={avatarPath ? "has-avatar" : "no-avatar"}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "text-center",
            typography.bodySmall.size,
            "text-white/40"
          )}
        >
          {avatarPath ? "Tap camera to change avatar" : "Tap camera to add avatar"}
        </motion.p>
      </div>

      {/* Name Input */}
      <div className={spacing.field}>
        <label
          className={cn(
            typography.label.size,
            typography.label.weight,
            typography.label.tracking,
            "uppercase text-white/70"
          )}
        >
          Character Name *
        </label>
        <div className="relative">
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Enter character name..."
            inputMode="text"
            className={cn(
              "w-full border bg-black/20 px-4 py-3.5 text-white placeholder-white/40 backdrop-blur-xl",
              radius.md,
              typography.body.size,
              interactive.transition.default,
              "focus:border-white/30 focus:bg-black/30 focus:outline-none",
              name.trim() ? "border-emerald-400/30 bg-emerald-400/5" : "border-white/10"
            )}
          />
          {name.trim() && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
            >
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center",
                  radius.full,
                  "bg-emerald-400/20"
                )}
              >
                <Sparkles className="h-3 w-3 text-emerald-300" />
              </div>
            </motion.div>
          )}
        </div>
        <p className={cn(typography.bodySmall.size, "text-white/40")}>
          This name will appear in chat conversations
        </p>
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
          Continue to Starting Scene
        </motion.button>
      </div>
    </motion.div>
  );
}
