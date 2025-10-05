import { motion } from "framer-motion";
import { Camera, X } from "lucide-react";
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
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="relative">
          <div
            className={cn(
              "h-28 w-28 overflow-hidden border border-white/10 bg-white/5",
              radius.full,
              shadows.md
            )}
          >
            {avatarPreview}
          </div>

          {/* Upload Button */}
          <label
            className={cn(
              "group absolute -bottom-1 -right-1 flex h-10 w-10 cursor-pointer items-center justify-center border border-white/10 bg-[#0b0b0d] text-white/60",
              radius.full,
              shadows.lg,
              interactive.transition.default,
              "hover:border-white/25 hover:bg-white/5 hover:text-white active:scale-95"
            )}
          >
            <Camera size={16} />
            <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
          </label>

          {/* Remove Button */}
          {avatarPath && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              onClick={() => onAvatarChange("")}
              className={cn(
                "absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center border border-red-400/30 bg-red-400/20 text-red-300",
                radius.full,
                shadows.lg,
                interactive.transition.default,
                "hover:border-red-400/50 hover:bg-red-400/30 active:scale-95"
              )}
            >
              <X size={14} />
            </motion.button>
          )}
        </div>

        <p
          className={cn(
            "text-center",
            typography.caption.size,
            typography.caption.weight,
            "text-white/40"
          )}
        >
          {avatarPath ? "Tap camera to change" : "Tap camera to add avatar"}
        </p>
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
          Name
        </label>
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Enter character name..."
          className={cn(
            "w-full border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/40 backdrop-blur-xl",
            radius.md,
            interactive.transition.default,
            "focus:border-white/30 focus:bg-black/30 focus:outline-none"
          )}
          autoFocus
        />
        <p className={cn(typography.bodySmall.size, "text-white/40")}>
          This name will appear in chat conversations
        </p>
      </div>

      {/* Continue Button */}
      <div className="pt-4">
        <motion.button
          disabled={!canContinue}
          onClick={onContinue}
          whileTap={{ scale: canContinue ? 0.98 : 1 }}
          className={cn(
            "w-full py-3.5",
            radius.md,
            typography.body.size,
            typography.h3.weight,
            interactive.transition.fast,
            canContinue
              ? cn(
                  "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
                  shadows.glow,
                  "hover:border-emerald-400/60 hover:bg-emerald-400/30"
                )
              : "cursor-not-allowed border border-white/5 bg-white/5 text-white/30"
          )}
        >
          Continue to Description
        </motion.button>
      </div>
    </motion.div>
  );
}
