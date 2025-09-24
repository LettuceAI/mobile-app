import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle } from "lucide-react";

import { ResetManager } from "../../../core/storage/reset";
import type { OnboardingState } from "../../../core/storage/schemas";

export function ResetPage() {
  const navigate = useNavigate();
  const [isResetting, setIsResetting] = useState(false);
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

      alert("All data has been reset successfully. The app will restart.");
      window.location.reload();
    } catch (error: any) {
      console.error("Reset failed:", error);
      alert(`Reset failed: ${error.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-white/10 px-6 py-4">
        <button
          onClick={() => navigate("/settings")}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-white">Reset App Data</h1>
          <p className="text-sm text-gray-400">Clear all app data and start fresh</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-12">
        <div className="mx-auto max-w-4xl space-y-12">
          {/* Warning Section */}
          <div className="text-center">
            <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl border border-red-500/50 bg-red-500/10 text-red-200">
              <AlertTriangle className="h-12 w-12" />
            </div>
            <h2 className="text-3xl font-semibold text-white mb-6">Reset all data</h2>
            <p className="text-lg text-gray-300 leading-relaxed max-w-2xl mx-auto">
              This permanently deletes providers, models, chat sessions, and stored preferences from this device.
            </p>
          </div>

          {/* Summary Section */}
          {resetSummary && (
            <div className="rounded-3xl border border-white/10 bg-black/10 p-10 text-base text-gray-300">
              <h3 className="text-2xl font-semibold text-white mb-8">What will be cleared</h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between py-3">
                  <span className="text-lg">Providers & models</span>
                  <span className="font-semibold text-white text-lg">Data will be cleared</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-lg">Stored chats</span>
                  <span className="font-semibold text-white text-lg">≈ {resetSummary.estimatedSessions}</span>
                </div>
                <div>
                  <span className="font-semibold text-white block mb-5 text-lg">Preferences snapshot</span>
                  <ul className="space-y-3 text-base text-gray-400 bg-black/30 rounded-xl p-6">
                    <li className="flex items-center justify-between">
                      <span>Onboarding completed</span>
                      <span className="text-gray-300">
                        {resetSummary.appState.onboarding.completed ? "Yes" : "No"}
                      </span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Provider setup</span>
                      <span className="text-gray-300">
                        {resetSummary.appState.onboarding.providerSetupCompleted ? "Done" : "Pending"}
                      </span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Model setup</span>
                      <span className="text-gray-300">
                        {resetSummary.appState.onboarding.modelSetupCompleted ? "Done" : "Pending"}
                      </span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Theme</span>
                      <span className="text-gray-300">{resetSummary.appState.theme}</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Tooltips seen</span>
                      <span className="text-gray-300">{resetSummary.appState.tooltipCount}</span>
                    </li>
                  </ul>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-lg">Files stored</span>
                  <span className="font-semibold text-white text-lg">{resetSummary.fileCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* Final Warning */}
          <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-10 text-base text-red-100">
            <h4 className="text-2xl font-semibold text-red-100 mb-4">Warning</h4>
            <p className="text-lg text-red-100/90 leading-relaxed">
              This action cannot be undone. The app will restart after the reset completes.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-6 sm:flex-row">
            <button
              onClick={() => navigate("/settings")}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-8 py-5 text-lg font-semibold text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="flex-1 rounded-xl border border-red-500/50 bg-red-500/20 px-8 py-5 text-lg font-semibold text-red-100 transition hover:border-red-500/70 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResetting ? (
                <div className="flex items-center justify-center gap-3">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-red-100 border-t-transparent" />
                  Resetting...
                </div>
              ) : (
                'Reset all data'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}