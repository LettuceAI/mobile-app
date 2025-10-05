import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Trash2, Database, FileText, Settings as SettingsIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { ResetManager } from "../../../core/storage/reset";
import type { OnboardingState } from "../../../core/storage/schemas";
import { typography, radius, spacing, interactive, shadows, cn } from "../../design-tokens";

export function ResetPage() {
  const navigate = useNavigate();
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resetSummary, setResetSummary] = useState<{
    appState: { onboarding: OnboardingState; theme: "light" | "dark"; tooltipCount: number };
    fileCount: number;
    estimatedSessions: number;
  } | null>(null);

  useEffect(() => {
    loadResetSummary();
  }, []);

  const loadResetSummary = async () => {
    try {
      const summary = await ResetManager.getResetSummary();
      setResetSummary(summary);
    } catch (error) {
      console.error("Failed to load reset summary:", error);
    }
  };

  const handleReset = async () => {
    try {
      setIsResetting(true);
      await ResetManager.resetAllData();

      // Success - reload app
      window.location.reload();
    } catch (error: any) {
      console.error("Reset failed:", error);
      alert(`Reset failed: ${error.message}`);
      setIsResetting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] text-gray-100">
      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-20">{/* Added pb-20 for mobile nav */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mx-auto max-w-2xl space-y-6"
        >
          {/* Warning Hero */}
          <div className={cn("text-center", spacing.section)}>
            <div
              className={cn(
                "mx-auto mb-6 flex h-20 w-20 items-center justify-center border border-red-400/30 bg-red-400/10 text-red-300",
                radius.full,
                shadows.lg
              )}
            >
              <AlertTriangle size={36} strokeWidth={2} />
            </div>
            <h2 className={cn(typography.h1.size, typography.h1.weight, "mb-3 text-white")}>
              Permanent Data Reset
            </h2>
            <p className={cn(typography.body.size, typography.body.lineHeight, "max-w-md mx-auto text-white/60")}>
              This will permanently delete all providers, models, chat sessions, and preferences from this device.
            </p>
          </div>

          {/* What Will Be Cleared */}
          {resetSummary && (
            <div className={cn("border border-white/10 bg-white/[0.02] p-6", radius.lg, spacing.section)}>
              <h3 className={cn(typography.h3.size, typography.h3.weight, "mb-4 text-white")}>
                What will be cleared
              </h3>
              
              <div className={spacing.item}>
                {/* Providers & Models */}
                <DataItem
                  icon={Database}
                  label="Providers & Models"
                  value="All configurations"
                  iconColor="text-blue-400"
                />
                
                {/* Chat Sessions */}
                <DataItem
                  icon={FileText}
                  label="Chat Sessions"
                  value={`≈ ${resetSummary.estimatedSessions} sessions`}
                  iconColor="text-emerald-400"
                />
                
                {/* Settings */}
                <DataItem
                  icon={SettingsIcon}
                  label="App Preferences"
                  value="All settings"
                  iconColor="text-amber-400"
                />
              </div>

              {/* Preferences Detail */}
              <div className={cn("mt-6 border-t border-white/10 pt-6", spacing.tight)}>
                <h4 className={cn(typography.label.size, typography.label.weight, "mb-3 uppercase text-white/70")}>
                  Current Preferences
                </h4>
                <div className={cn("border border-white/10 bg-black/20 p-4", radius.md, spacing.tight)}>
                  <PreferenceItem
                    label="Onboarding"
                    value={resetSummary.appState.onboarding.completed ? "Completed" : "Incomplete"}
                  />
                  <PreferenceItem
                    label="Provider Setup"
                    value={resetSummary.appState.onboarding.providerSetupCompleted ? "Done" : "Pending"}
                  />
                  <PreferenceItem
                    label="Model Setup"
                    value={resetSummary.appState.onboarding.modelSetupCompleted ? "Done" : "Pending"}
                  />
                  <PreferenceItem
                    label="Theme"
                    value={resetSummary.appState.theme}
                  />
                  <PreferenceItem
                    label="Files Stored"
                    value={`${resetSummary.fileCount} files`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Final Warning */}
          <div className={cn("border border-red-400/30 bg-red-400/5 p-6", radius.lg)}>
            <div className="flex items-start gap-3">
              <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center bg-red-400/20 text-red-300", radius.md)}>
                <AlertTriangle size={18} strokeWidth={2.5} />
              </div>
              <div className={spacing.tight}>
                <h4 className={cn(typography.body.size, typography.h3.weight, "text-red-200")}>
                  This action cannot be undone
                </h4>
                <p className={cn(typography.bodySmall.size, "text-red-200/70")}>
                  All data will be permanently deleted. The app will restart after reset completes.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className={cn("flex flex-col gap-3 pt-4", "sm:flex-row")}>
            <button
              onClick={() => navigate("/settings")}
              className={cn(
                "flex-1 px-6 py-3",
                radius.md,
                typography.body.size,
                typography.h3.weight,
                "border border-white/10 bg-white/5 text-white",
                interactive.transition.default,
                "hover:border-white/20 hover:bg-white/10",
                interactive.active.scale
              )}
            >
              Cancel
            </button>
            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={isResetting}
              className={cn(
                "flex-1 px-6 py-3",
                radius.md,
                typography.body.size,
                typography.h3.weight,
                "border border-red-400/40 bg-red-400/20 text-red-100",
                interactive.transition.default,
                "hover:border-red-400/60 hover:bg-red-400/30",
                interactive.active.scale,
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {isResetting ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-100/30 border-t-red-100" />
                  <span>Resetting...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Trash2 size={16} />
                  <span>Reset All Data</span>
                </div>
              )}
            </button>
          </div>
        </motion.div>
      </main>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowConfirmModal(false)}
          >
            <motion.div
              className={cn(
                "w-full max-w-lg border border-white/10 bg-[#0b0b0d] p-6",
                "rounded-t-3xl sm:rounded-3xl sm:mb-8",
                shadows.xl
              )}
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-6">
                <h3 className={cn(typography.h2.size, typography.h2.weight, "text-white")}>
                  Confirm Reset
                </h3>
                <p className={cn(typography.body.size, "mt-2 text-white/60")}>
                  Are you absolutely sure? This action is permanent.
                </p>
              </div>

              {/* Actions */}
              <div className={cn("flex flex-col gap-3")}>
                <button
                  onClick={handleReset}
                  disabled={isResetting}
                  className={cn(
                    "w-full px-6 py-3",
                    radius.md,
                    typography.body.size,
                    typography.h3.weight,
                    "border border-red-400/40 bg-red-400/20 text-red-100",
                    interactive.transition.fast,
                    "hover:border-red-400/60 hover:bg-red-400/30",
                    interactive.active.scale,
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {isResetting ? "Resetting..." : "Yes, Reset Everything"}
                </button>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isResetting}
                  className={cn(
                    "w-full px-6 py-3",
                    radius.md,
                    typography.body.size,
                    "border border-white/10 bg-white/5 text-white/60",
                    interactive.transition.fast,
                    "hover:border-white/20 hover:bg-white/10 hover:text-white",
                    interactive.active.scale,
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

// Helper Components
function DataItem({
  icon: Icon,
  label,
  value,
  iconColor,
}: {
  icon: any;
  label: string;
  value: string;
  iconColor: string;
}) {
  return (
    <div className={cn("flex items-center justify-between py-3")}>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-8 w-8 items-center justify-center bg-white/5", radius.md, iconColor)}>
          <Icon size={16} strokeWidth={2.5} />
        </div>
        <span className={cn(typography.body.size, "text-white/70")}>{label}</span>
      </div>
      <span className={cn(typography.body.size, typography.body.weight, "text-white")}>{value}</span>
    </div>
  );
}

function PreferenceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(typography.bodySmall.size, "text-white/60")}>{label}</span>
      <span className={cn(typography.bodySmall.size, "text-white/80")}>{value}</span>
    </div>
  );
}