import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { ResetManager } from "../../../core/storage/reset";
import { typography, radius, interactive, shadows, cn } from "../../design-tokens";

export function ResetPage() {
  const navigate = useNavigate();
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleReset = async () => {
    try {
      setIsResetting(true);
      await ResetManager.resetAllData();

      // Navigate to welcome/setup page after successful reset
      navigate("/welcome", { replace: true });
    } catch (error: any) {
      console.error("Reset failed:", error);
      alert(`Reset failed: ${error.message}`);
      setIsResetting(false);
      setShowConfirmModal(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] text-gray-100">
      {/* Content */}
      <main className="flex-1 px-4 pb-20 pt-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mx-auto w-full max-w-md text-center"
        >
          {/* Warning Icon */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className={cn(
              "mx-auto mb-8 flex h-24 w-24 items-center justify-center border border-red-400/30 bg-red-400/10 text-red-300",
              radius.full,
              shadows.lg
            )}
          >
            <AlertTriangle size={44} strokeWidth={2} />
          </motion.div>

          {/* Title & Description */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-10 space-y-3"
          >
            <h2 className={cn(typography.display.size, typography.display.weight, "text-white")}>
              Reset Everything
            </h2>
            <p className={cn(typography.body.size, typography.body.lineHeight, "text-white/50")}>
              This will permanently delete all providers, models, characters, chat sessions, and preferences from this device.
            </p>
          </motion.div>

          {/* Warning Message */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={cn(
              "mb-8 border border-red-400/30 bg-red-400/5 p-4",
              radius.lg
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <AlertTriangle size={16} className="text-red-300" strokeWidth={2.5} />
              <p className={cn(typography.bodySmall.size, typography.h3.weight, "text-red-200")}>
                This action cannot be undone
              </p>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col gap-3"
          >
            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={isResetting}
              className={cn(
                "w-full px-6 py-4",
                radius.md,
                typography.body.size,
                typography.h3.weight,
                "border border-red-400/40 bg-red-400/20 text-red-100",
                shadows.glow,
                interactive.transition.default,
                "active:scale-[0.97] active:border-red-400/60 active:bg-red-400/30",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <div className="flex items-center justify-center gap-2">
                <Trash2 size={18} />
                <span>Reset All Data</span>
              </div>
            </button>

            <button
              onClick={() => navigate("/settings")}
              disabled={isResetting}
              className={cn(
                "w-full px-6 py-3",
                radius.md,
                typography.body.size,
                "border border-white/10 bg-white/5 text-white/60",
                interactive.transition.default,
                "active:scale-[0.97] active:bg-white/10",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              Cancel
            </button>
          </motion.div>
        </motion.div>
      </main>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-md sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isResetting && setShowConfirmModal(false)}
          >
            <motion.div
              className={cn(
                "w-full max-w-md border border-white/10 bg-[#0b0b0d] p-6",
                "rounded-t-3xl sm:rounded-3xl",
                shadows.xl
              )}
              initial={{ y: "100%", opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: "100%", opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-6 text-center">
                <div
                  className={cn(
                    "mx-auto mb-4 flex h-16 w-16 items-center justify-center border border-red-400/40 bg-red-400/15 text-red-300",
                    radius.full
                  )}
                >
                  <AlertTriangle size={28} strokeWidth={2.5} />
                </div>
                <h3 className={cn(typography.h2.size, typography.h2.weight, "mb-2 text-white")}>
                  Are You Sure?
                </h3>
                <p className={cn(typography.body.size, "text-white/50")}>
                  All your data will be permanently deleted. The app will return to first-time setup.
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleReset}
                  disabled={isResetting}
                  className={cn(
                    "w-full px-6 py-3.5",
                    radius.md,
                    typography.body.size,
                    typography.h3.weight,
                    "border border-red-400/40 bg-red-400/20 text-red-100",
                    interactive.transition.fast,
                    "active:scale-[0.97] active:bg-red-400/30",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {isResetting ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-100/30 border-t-red-100" />
                      <span>Resetting...</span>
                    </div>
                  ) : (
                    "Yes, Reset Everything"
                  )}
                </button>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isResetting}
                  className={cn(
                    "w-full px-6 py-3",
                    radius.md,
                    typography.body.size,
                    "text-white/60",
                    interactive.transition.fast,
                    "active:scale-[0.97] active:text-white",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}