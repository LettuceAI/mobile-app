import { motion } from "framer-motion";
import { MessageSquare, Sparkles, Theater } from "lucide-react";
import { typography, radius, spacing, interactive, shadows, cn } from "../../../../design-tokens";

interface GroupSetupStepProps {
  chatType: "conversation" | "roleplay";
  onChatTypeChange: (value: "conversation" | "roleplay") => void;
  groupName: string;
  onGroupNameChange: (value: string) => void;
  namePlaceholder: string;
  onContinue: () => void;
  canContinue: boolean;
}

export function GroupSetupStep({
  chatType,
  onChatTypeChange,
  groupName,
  onGroupNameChange,
  namePlaceholder,
  onContinue,
  canContinue,
}: GroupSetupStepProps) {
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
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-purple-400/30 bg-purple-400/10 p-1.5">
            <MessageSquare className="h-4 w-4 text-purple-400" />
          </div>
          <h2 className={cn(typography.h1.size, typography.h1.weight, "text-white")}>
            Group Setup
          </h2>
        </div>
        <p className={cn(typography.body.size, "mt-2 text-white/50")}>
          Configure your group chat settings
        </p>
      </div>

      {/* Chat Type Selection */}
      <div className={spacing.field}>
        <label
          className={cn(
            typography.label.size,
            typography.label.weight,
            typography.label.tracking,
            "uppercase text-white/70",
          )}
        >
          Chat Type
        </label>

        <div className="grid grid-cols-2 gap-3">
          {/* Conversation Option */}
          <button
            onClick={() => onChatTypeChange("conversation")}
            className={cn(
              "relative flex flex-col items-center gap-2 p-4",
              radius.lg,
              "border text-center",
              interactive.transition.fast,
              chatType === "conversation"
                ? "border-emerald-400/40 bg-emerald-400/10"
                : "border-white/10 bg-white/5 hover:border-white/20",
            )}
          >
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center",
                radius.lg,
                chatType === "conversation"
                  ? "border border-emerald-400/30 bg-emerald-400/20"
                  : "border border-white/10 bg-white/5",
              )}
            >
              <MessageSquare
                className={cn(
                  "h-6 w-6",
                  chatType === "conversation" ? "text-emerald-300" : "text-white/50",
                )}
              />
            </div>
            <div>
              <div
                className={cn(
                  "text-sm font-semibold",
                  chatType === "conversation" ? "text-emerald-100" : "text-white/80",
                )}
              >
                Conversation
              </div>
              <div className="mt-0.5 text-xs text-white/40">Casual chat</div>
            </div>
            {chatType === "conversation" && (
              <motion.div
                layoutId="chatTypeIndicator"
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400"
              >
                <Sparkles className="h-3 w-3 text-black" />
              </motion.div>
            )}
          </button>

          {/* Roleplay Option */}
          <button
            onClick={() => onChatTypeChange("roleplay")}
            className={cn(
              "relative flex flex-col items-center gap-2 p-4",
              radius.lg,
              "border text-center",
              interactive.transition.fast,
              chatType === "roleplay"
                ? "border-emerald-400/40 bg-emerald-400/10"
                : "border-white/10 bg-white/5 hover:border-white/20",
            )}
          >
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center",
                radius.lg,
                chatType === "roleplay"
                  ? "border border-emerald-400/30 bg-emerald-400/20"
                  : "border border-white/10 bg-white/5",
              )}
            >
              <Theater
                className={cn(
                  "h-6 w-6",
                  chatType === "roleplay" ? "text-emerald-300" : "text-white/50",
                )}
              />
            </div>
            <div>
              <div
                className={cn(
                  "text-sm font-semibold",
                  chatType === "roleplay" ? "text-emerald-100" : "text-white/80",
                )}
              >
                Roleplay
              </div>
              <div className="mt-0.5 text-xs text-white/40">With scenes</div>
            </div>
            {chatType === "roleplay" && (
              <motion.div
                layoutId="chatTypeIndicator"
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400"
              >
                <Sparkles className="h-3 w-3 text-black" />
              </motion.div>
            )}
          </button>
        </div>

        <p className={cn(typography.bodySmall.size, "mt-2 text-white/40")}>
          {chatType === "conversation"
            ? "Casual group conversation without starting scenes"
            : "Roleplay scenario with starting scene and immersive prompts"}
        </p>
      </div>

      {/* Group Name Input */}
      <div className={spacing.field}>
        <label
          className={cn(
            typography.label.size,
            typography.label.weight,
            typography.label.tracking,
            "uppercase text-white/70",
          )}
        >
          Group Name <span className="text-white/40">(Optional)</span>
        </label>
        <div className="relative">
          <input
            value={groupName}
            onChange={(e) => onGroupNameChange(e.target.value)}
            placeholder={namePlaceholder}
            inputMode="text"
            className={cn(
              "w-full border bg-black/20 px-4 py-3.5 text-white placeholder-white/40 backdrop-blur-xl",
              radius.md,
              typography.body.size,
              interactive.transition.default,
              "focus:border-white/30 focus:bg-black/30 focus:outline-none",
              groupName.trim() ? "border-emerald-400/30 bg-emerald-400/5" : "border-white/10",
            )}
          />
          {groupName.trim() && (
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
          Leave empty to auto-generate from character names
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
                  "active:border-emerald-400/60 active:bg-emerald-400/30",
                )
              : "cursor-not-allowed border border-white/5 bg-white/5 text-white/30",
          )}
        >
          {chatType === "roleplay" ? "Continue to Starting Scene" : "Create Group Chat"}
        </motion.button>
      </div>
    </motion.div>
  );
}
