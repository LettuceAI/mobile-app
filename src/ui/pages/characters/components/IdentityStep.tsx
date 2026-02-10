import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Image, Upload, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { typography, radius, spacing, interactive, shadows, cn } from "../../../design-tokens";
import { AvatarPicker } from "../../../components/AvatarPicker";
import type { AvatarCrop } from "../../../../core/storage/schemas";

interface IdentityStepProps {
  name: string;
  onNameChange: (value: string) => void;
  avatarPath: string;
  onAvatarChange: (value: string) => void;
  avatarCrop?: AvatarCrop | null;
  onAvatarCropChange?: (value: AvatarCrop | null) => void;
  avatarRoundPath?: string | null;
  onAvatarRoundChange?: (value: string | null) => void;
  backgroundImagePath: string;
  onBackgroundImageChange: (value: string) => void;
  onBackgroundImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disableAvatarGradient: boolean;
  onDisableAvatarGradientChange: (value: boolean) => void;
  onContinue: () => void;
  canContinue: boolean;
  importingAvatar?: boolean;
  avatarImportError?: string | null;
  onImport?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function IdentityStep({
  name,
  onNameChange,
  avatarPath,
  onAvatarChange,
  avatarCrop,
  onAvatarCropChange,
  avatarRoundPath,
  onAvatarRoundChange,
  backgroundImagePath,
  onBackgroundImageChange,
  onBackgroundImageUpload,
  disableAvatarGradient,
  onDisableAvatarGradientChange,
  onContinue,
  canContinue,
  importingAvatar = false,
  avatarImportError = null,
  onImport,
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

      {/* Desktop: Two-column layout / Mobile: stacked */}
      <div className="flex flex-col lg:flex-row lg:gap-8 lg:items-start">
        {/* Avatar Section */}
        <div className="flex flex-col items-center py-4 lg:shrink-0">
          <div className="relative">
            <AvatarPicker
              currentAvatarPath={avatarPath}
              onAvatarChange={onAvatarChange}
              avatarCrop={avatarCrop}
              onAvatarCropChange={onAvatarCropChange}
              avatarRoundPath={avatarRoundPath}
              onAvatarRoundChange={onAvatarRoundChange}
              avatarPreview={
                importingAvatar ? (
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="animate-spin text-white/50" size={34} />
                  </div>
                ) : avatarPath ? undefined : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Camera className="text-white/30" size={36} />
                  </div>
                )
              }
            />

            {/* Remove Button - top left */}
            {avatarPath && (
              <button
                onClick={() => {
                  onAvatarChange("");
                  onAvatarCropChange?.(null);
                  onAvatarRoundChange?.(null);
                }}
                className="absolute -top-1 -left-1 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#1a1a1c] text-white/60 transition hover:bg-red-500/80 hover:border-red-500/50 hover:text-white active:scale-95"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-white/40">Tap camera to add or generate avatar</p>
          {importingAvatar && <p className="mt-1 text-xs text-emerald-300">Importing avatar...</p>}
          {avatarImportError && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-red-300">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span className="max-w-[320px] whitespace-pre-line leading-4">
                {avatarImportError}
              </span>
            </div>
          )}
        </div>

        {/* Right side fields (desktop) / Below avatar (mobile) */}
        <div className="lg:flex-1 space-y-6">
          {/* Name Input */}
          <div className={spacing.field}>
            <label
              className={cn(
                typography.label.size,
                typography.label.weight,
                typography.label.tracking,
                "uppercase text-white/70",
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
                  name.trim() ? "border-emerald-400/30 bg-emerald-400/5" : "border-white/10",
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
                      "bg-emerald-400/20",
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
                <label
                  className={cn(
                    "flex cursor-pointer items-center justify-between border border-white/10 bg-black/20 px-4 py-3",
                    radius.md,
                    interactive.transition.default,
                    "active:bg-black/30",
                  )}
                >
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
                "uppercase text-white/70",
              )}
            >
              Chat Background <span className="text-white/40">(Optional)</span>
            </label>
            <div
              className={cn(
                "overflow-hidden border",
                radius.md,
                backgroundImagePath
                  ? "border-purple-400/30 bg-purple-400/5"
                  : "border-white/10 bg-black/20",
              )}
            >
              {backgroundImagePath ? (
                <div className="relative">
                  <img
                    src={backgroundImagePath}
                    alt="Background preview"
                    className="h-24 w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <span
                      className={cn(
                        typography.caption.size,
                        "text-white/80 bg-black/50 px-2 py-1",
                        radius.sm,
                      )}
                    >
                      Background Preview
                    </span>
                  </div>
                  <button
                    onClick={() => onBackgroundImageChange("")}
                    className={cn(
                      "absolute top-2 right-2 flex h-6 w-6 items-center justify-center border border-white/20 bg-black/50 text-white/70",
                      radius.full,
                      interactive.transition.fast,
                      "active:scale-95 active:bg-black/70",
                    )}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <label
                  className={cn(
                    "flex h-24 cursor-pointer flex-col items-center justify-center gap-2",
                    interactive.transition.default,
                    "active:bg-white/5",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center border border-white/10 bg-white/5",
                      radius.md,
                    )}
                  >
                    <Image size={16} className="text-white/40" />
                  </div>
                  <div className="text-center">
                    <p className={cn(typography.bodySmall.size, "text-white/70")}>Add Background</p>
                    <p className={cn(typography.caption.size, "text-white/40")}>
                      Tap to select image
                    </p>
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
        </div>
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
                  "active:border-emerald-400/60 active:bg-emerald-400/30",
                )
              : "cursor-not-allowed border border-white/5 bg-white/5 text-white/30",
          )}
        >
          Continue to Description
        </motion.button>
      </div>

      {/* Import Character Button */}
      {onImport && (
        <div className="pt-2">
          <label
            className={cn(
              "flex w-full cursor-pointer items-center justify-center gap-2 border border-blue-400/40 bg-blue-400/20 py-3.5 text-sm font-semibold text-blue-100",
              radius.md,
              interactive.transition.fast,
              "active:scale-[0.97] active:bg-blue-400/30",
            )}
          >
            <Upload className="h-4 w-4" />
            Import Character from File
            <input type="file" onChange={onImport} className="hidden" />
          </label>
          <p className={cn(typography.bodySmall.size, "mt-2 text-center text-white/40")}>
            Load a character from a .uec (or .json) export file
          </p>
        </div>
      )}
    </motion.div>
  );
}
