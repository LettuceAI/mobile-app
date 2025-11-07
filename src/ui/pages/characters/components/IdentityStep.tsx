import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Sparkles, Image } from "lucide-react";
import type { ReactNode } from "react";
import { typography, radius, spacing, interactive, shadows, cn } from "../../../design-tokens";

interface IdentityStepProps {
  name: string;
  onNameChange: (value: string) => void;
  avatarPath: string;
  onAvatarChange: (value: string) => void;
  backgroundImagePath: string;
  onBackgroundImageChange: (value: string) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBackgroundImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disableAvatarGradient: boolean;
  onDisableAvatarGradientChange: (value: boolean) => void;
  onContinue: () => void;
  canContinue: boolean;
  avatarPreview: ReactNode;
}

export function IdentityStep({
  name,
  onNameChange,
  avatarPath,
  onAvatarChange,
  backgroundImagePath,
  onBackgroundImageChange,
  onUpload,
  onBackgroundImageUpload,
  disableAvatarGradient,
  onDisableAvatarGradientChange,
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

        <div className="relative">
          <motion.div
            whileTap={{ scale: 0.97 }}
            className={cn(
              "relative h-32 w-32 overflow-hidden border-2",
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
                "absolute -top-1 -left-1 flex h-10 w-10 items-center justify-center bg-red-500",
                radius.full,
                interactive.transition.default,
                "active:scale-95 active:bg-red-600"
              )}
              >
              <X size={24} className="text-white" strokeWidth={3} />
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

      {/* Avatar Gradient Toggle (only show if avatar exists) */}
      <AnimatePresence>
        {avatarPath && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={spacing.field}
          >
            <label className={cn(
              "flex cursor-pointer items-center justify-between border border-white/10 bg-black/20 px-4 py-3",
              radius.md,
              interactive.transition.default,
              "active:bg-black/30"
            )}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                  <span className={cn(typography.body.size, "font-medium text-white")}>
                    Avatar Gradient
                  </span>
                </div>
                <p className={cn(typography.bodySmall.size, "mt-1 text-white/40")}>
                  Generate dynamic gradients from avatar colors
                </p>
              </div>
              <div className="relative ml-3">
                <input
                  type="checkbox"
                  checked={!disableAvatarGradient}
                  onChange={(e) => onDisableAvatarGradientChange(!e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-white/20 transition peer-checked:bg-emerald-500/80"></div>
                <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5"></div>
              </div>
            </label>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Image (Optional) */}
      <div className={spacing.field}>
        <label
          className={cn(
            typography.label.size,
            typography.label.weight,
            typography.label.tracking,
            "uppercase text-white/70"
          )}
        >
          Chat Background <span className="text-white/40">(Optional)</span>
        </label>
        <div className={cn(
          "overflow-hidden border",
          radius.md,
          backgroundImagePath ? "border-purple-400/30 bg-purple-400/5" : "border-white/10 bg-black/20"
        )}>
          {backgroundImagePath ? (
            <div className="relative">
              <img 
                src={backgroundImagePath} 
                alt="Background preview" 
                className="h-24 w-full object-cover"
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <span className={cn(typography.caption.size, "text-white/80 bg-black/50 px-2 py-1", radius.sm)}>
                  Background Preview
                </span>
              </div>
              <button
                onClick={() => onBackgroundImageChange("")}
                className={cn(
                  "absolute top-2 right-2 flex h-6 w-6 items-center justify-center border border-white/20 bg-black/50 text-white/70",
                  radius.full,
                  interactive.transition.fast,
                  "active:scale-95 active:bg-black/70"
                )}
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <label className={cn(
              "flex h-24 cursor-pointer flex-col items-center justify-center gap-2",
              interactive.transition.default,
              "active:bg-white/5"
            )}>
              <div className={cn(
                "flex h-8 w-8 items-center justify-center border border-white/10 bg-white/5",
                radius.md
              )}>
                <Image size={16} className="text-white/40" />
              </div>
              <div className="text-center">
                <p className={cn(typography.bodySmall.size, "text-white/70")}>Add Background</p>
                <p className={cn(typography.caption.size, "text-white/40")}>Tap to select image</p>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={onBackgroundImageUpload}
                className="hidden"
              />
            </label>
          )}
        </div>
        <p className={cn(typography.bodySmall.size, "text-white/40")}>
          Optional background image for chat conversations
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
