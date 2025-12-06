import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, ShieldCheck, Sparkles, Upload, FileArchive, Lock, Loader2, Eye, EyeOff, CheckCircle, HardDrive, Download } from "lucide-react";
import { motion } from "framer-motion";

import {
  setOnboardingCompleted,
  setOnboardingSkipped,
} from "../../../core/storage/appState";
import { storageBridge } from "../../../core/storage/files";
import logoSvg from "../../../assets/logo.svg";
import { typography, radius, spacing, interactive, shadows, colors, cn } from "../../design-tokens";

export function WelcomePage() {
  const navigate = useNavigate();
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [showRestoreBackup, setShowRestoreBackup] = useState(false);

  const handleAddProvider = () => {
    navigate("/onboarding/provider");
  };

  const handleConfirmSkip = async () => {
    await setOnboardingCompleted(true);
    await setOnboardingSkipped(true);
    // Small delay to ensure state is persisted before navigation
    await new Promise(resolve => setTimeout(resolve, 100));
    navigate("/");
  };

  const handleRestoreComplete = async () => {
    await setOnboardingCompleted(true);
    navigate("/chat");
  };

  return (
    <div className={cn("flex min-h-screen flex-col text-gray-200", colors.effects.gradient.surface)}>
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">

        {/* Logo Section - Hero */}
        <motion.div
          className="flex flex-col items-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="relative mb-8">
            {/* Glow effect */}
            <div className={cn("absolute -inset-6 rounded-full blur-2xl animate-pulse", colors.effects.gradient.brand)} />

            {/* Logo container */}
            <div className={cn(
              "relative flex h-24 w-24 items-center justify-center",
              colors.glass.default,
              radius.full,
              shadows.xl
            )}>
              <img src={logoSvg} alt="LettuceAI" className="h-14 w-14" />
            </div>
          </div>

          {/* Brand name */}
          <h1 className={cn(
            typography.display.size,
            typography.display.weight,
            "mb-3",
            colors.effects.gradient.text
          )}>
            LettuceAI
          </h1>

          {/* Tagline */}
          <p className={cn(
            typography.body.size,
            typography.body.lineHeight,
            "max-w-[280px] text-center text-white/60"
          )}>
            Your personal AI companion. Private, secure, and always on-device.
          </p>
        </motion.div>

        {/* Feature Pills */}
        <motion.div
          className={cn("mb-8 flex items-center justify-center", spacing.inlineSmall)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          {quickFacts.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className={cn(
                "flex items-center gap-1.5 border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm",
                radius.full
              )}
            >
              <Icon size={14} className="text-emerald-400" strokeWidth={2.5} />
              <span className={cn(typography.bodySmall.size, typography.label.weight, "text-white/70")}>
                {label}
              </span>
            </div>
          ))}
        </motion.div>

        {/* Beta Warning */}
        <motion.div
          className={cn(
            "mb-8 w-full max-w-sm rounded-xl border border-amber-400/30 bg-amber-400/10 p-4"
          )}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
            <div>
              <h3 className={cn(typography.bodySmall.size, typography.body.weight, "text-amber-200")}>
                Beta Build
              </h3>
              <p className={cn(typography.caption.size, "mt-1 text-amber-200/70")}>
                This is a beta version. Please report any issues or feedback on our GitHub repository.
              </p>
            </div>
          </div>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          className={cn("w-full max-w-xs", spacing.field)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <button
            className={cn(
              "group w-full flex items-center justify-center gap-2 px-6 py-4",
              radius.md,
              "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
              typography.body.size,
              typography.h3.weight,
              shadows.glow,
              interactive.transition.default,
              interactive.active.scale,
              "hover:border-emerald-400/60 hover:bg-emerald-400/30"
            )}
            onClick={handleAddProvider}
          >
            <span>Get Started</span>
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
          </button>

          <button
            className={cn(
              "w-full px-6 py-3",
              radius.md,
              "border border-white/10 bg-white/5 text-white/60",
              typography.body.size,
              interactive.transition.default,
              interactive.active.scale,
              "hover:border-white/20 hover:bg-white/[0.08] hover:text-white/80"
            )}
            onClick={() => setShowSkipWarning(true)}
          >
            Skip for now
          </button>

          <button
            className={cn(
              "w-full flex items-center justify-center gap-2 px-6 py-3",
              radius.md,
              "border border-white/10 bg-white/5 text-white/60",
              typography.body.size,
              interactive.transition.default,
              interactive.active.scale,
              "hover:border-white/20 hover:bg-white/[0.08] hover:text-white/80"
            )}
            onClick={() => setShowRestoreBackup(true)}
          >
            <Upload size={16} />
            Restore from Backup
          </button>
        </motion.div>

        {/* Bottom hint */}
        <motion.p
          className={cn(
            "mt-8 text-center",
            typography.caption.size,
            "text-white/40"
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          Setup takes less than 2 minutes
        </motion.p>
      </div>

      {showSkipWarning && (
        <SkipWarning
          onClose={() => setShowSkipWarning(false)}
          onConfirm={handleConfirmSkip}
          onAddProvider={handleAddProvider}
        />
      )}

      {showRestoreBackup && (
        <RestoreBackupModal
          onClose={() => setShowRestoreBackup(false)}
          onComplete={handleRestoreComplete}
        />
      )}
    </div>
  );
}

const quickFacts = [
  { icon: ShieldCheck, label: "On-device only" },
  { icon: Sparkles, label: "Character ready" },
];

function SkipWarning({
  onClose,
  onConfirm,
  onAddProvider,
}: {
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  onAddProvider: () => void;
}) {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 200);
  };

  const handleConfirm = () => {
    setIsExiting(true);
    setTimeout(() => void onConfirm(), 200);
  };

  const handleAddProvider = () => {
    setIsExiting(true);
    setTimeout(onAddProvider, 200);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.2 }}
      onClick={handleClose}
    >
      <motion.div
        className={cn(
          "w-full max-w-lg border border-white/10 bg-[#0b0b0d] p-6",
          "rounded-t-3xl sm:rounded-3xl sm:mb-8",
          shadows.xl
        )}
        initial={{ y: "100%", opacity: 0 }}
        animate={{
          y: isExiting ? "100%" : 0,
          opacity: isExiting ? 0 : 1
        }}
        transition={{
          type: "spring",
          damping: 30,
          stiffness: 350,
          duration: 0.2
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className={cn(typography.h2.size, typography.h2.weight, "text-white")}>
            Skip setup?
          </h3>
        </div>

        {/* Warning content */}
        <div className={cn(
          "flex items-start gap-3 border border-amber-400/20 bg-amber-400/5 p-4 mb-6",
          radius.md
        )}>
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center bg-amber-400/20 text-amber-300",
            radius.md
          )}>
            <AlertTriangle size={20} strokeWidth={2.5} />
          </div>
          <div className={spacing.tight}>
            <h4 className={cn(
              typography.body.size,
              typography.h3.weight,
              "text-white"
            )}>
              Provider needed to chat
            </h4>
            <p className={cn(
              typography.bodySmall.size,
              typography.bodySmall.lineHeight,
              "text-white/60"
            )}>
              Without a provider, you won't be able to send messages. You can add one later from settings.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className={cn("flex flex-col", spacing.field)}>
          <button
            className={cn(
              "inline-flex items-center justify-center gap-2 px-6 py-3",
              radius.md,
              "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
              typography.body.size,
              typography.h3.weight,
              interactive.transition.fast,
              interactive.active.scale,
              "hover:border-emerald-400/60 hover:bg-emerald-400/30"
            )}
            onClick={handleAddProvider}
          >
            <span>Add Provider</span>
            <ArrowRight size={16} strokeWidth={2.5} />
          </button>
          <button
            className={cn(
              "px-6 py-3",
              radius.md,
              "border border-white/10 bg-white/5 text-white/60",
              typography.body.size,
              interactive.transition.fast,
              interactive.active.scale,
              "hover:border-white/20 hover:bg-white/10 hover:text-white"
            )}
            onClick={handleConfirm}
          >
            Skip anyway
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface BackupInfo {
  version: number;
  createdAt: number;
  appVersion: string;
  encrypted: boolean;
  totalFiles: number;
  path: string;
  filename: string;
}

function RestoreBackupModal({
  onClose,
  onComplete: _onComplete,
}: {
  onClose: () => void;
  onComplete: () => void | Promise<void>;
}) {
  const [isExiting, setIsExiting] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBackup, setSelectedBackup] = useState<BackupInfo | null>(null);
  const [isPickedFile, setIsPickedFile] = useState(false);
  const pickedFileDataRef = useRef<Uint8Array | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmbeddingPrompt, setShowEmbeddingPrompt] = useState(false);
  const navigate = useNavigate();

  // Load backups on mount
  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    try {
      setLoading(true);
      const list = await storageBridge.backupList();
      setBackups(list);
    } catch (e) {
      console.error("Failed to load backups:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseForBackup = async () => {
    try {
      setError(null);
      const result = await storageBridge.backupPickFile();
      if (!result) return; // User cancelled
      
      const { data, filename } = result;
      
      // Store file data in ref
      pickedFileDataRef.current = data;
      
      // Get info using bytes
      const info = await storageBridge.backupGetInfoFromBytes(data);
      
      const backupInfo: BackupInfo = {
        ...info,
        path: "",
        filename,
      };
      
      setSelectedBackup(backupInfo);
      setIsPickedFile(true);
      setPassword("");
    } catch (e) {
      console.error("Failed to browse for backup:", e);
      setError(e instanceof Error ? e.message : "Failed to open file");
    }
  };

  const handleClose = () => {
    if (restoring) return;
    pickedFileDataRef.current = null;
    setIsExiting(true);
    setTimeout(onClose, 200);
  };

  const handleRestore = async (skipDynamicMemoryCheck = false) => {
    if (!selectedBackup) return;

    if (selectedBackup.encrypted && password.length < 1) {
      setError("Password is required");
      return;
    }

    try {
      setError(null);
      
      // Verify password first for encrypted backups
      if (selectedBackup.encrypted) {
        const valid = isPickedFile && pickedFileDataRef.current
          ? await storageBridge.backupVerifyPasswordFromBytes(pickedFileDataRef.current, password)
          : await storageBridge.backupVerifyPassword(selectedBackup.path, password);
          
        if (!valid) {
          setError("Incorrect password");
          return;
        }
      }
      
      // Check for dynamic memory if not skipping
      if (!skipDynamicMemoryCheck) {
        const hasDynamicMemory = isPickedFile && pickedFileDataRef.current
          ? await storageBridge.backupCheckDynamicMemoryFromBytes(
              pickedFileDataRef.current,
              selectedBackup.encrypted ? password : undefined
            )
          : await storageBridge.backupCheckDynamicMemory(
              selectedBackup.path,
              selectedBackup.encrypted ? password : undefined
            );

        if (hasDynamicMemory) {
          // Check if embedding model exists
          const hasEmbeddingModel = await storageBridge.checkEmbeddingModel();
          if (!hasEmbeddingModel) {
            // Show the prompt
            setShowEmbeddingPrompt(true);
            return;
          }
        }
      }
      
      setRestoring(true);

      if (isPickedFile && pickedFileDataRef.current) {
        // Use byte-based import for picked files
        const data = pickedFileDataRef.current;
        
        // Password already verified above
        await storageBridge.backupImportFromBytes(
          data,
          selectedBackup.encrypted ? password : undefined
        );
      } else {
        // Use path-based import
        // Password already verified above
        await storageBridge.backupImport(
          selectedBackup.path,
          selectedBackup.encrypted ? password : undefined
        );
      }

      pickedFileDataRef.current = null;
      setIsExiting(true);
      setTimeout(() => {
        navigate("/");
      }, 200);
    } catch (e) {
      console.log(e)
      setError(e instanceof Error ? e.message : "Failed to restore backup");
      setRestoring(false);
    }
  };

  const handleDownloadModel = () => {
    setShowEmbeddingPrompt(false);
    handleClose();
    navigate("/settings/embedding-download");
  };

  const handleDisableAndContinue = async () => {
    setShowEmbeddingPrompt(false);
    setRestoring(true);
    
    try {
      // Import the backup first
      const backupData = isPickedFile ? pickedFileDataRef.current : null;
      
      if (backupData) {
        // Mobile/picked file path
        await storageBridge.backupImportFromBytes(
          backupData,
          password || undefined
        );
      } else if (selectedBackup) {
        // Desktop path
        if (selectedBackup.encrypted && !password) {
          setError("Password required for encrypted backup");
          return;
        }
        await storageBridge.backupImport(selectedBackup.path, password || undefined);
      }
      
      // After successful import, disable dynamic memory for all characters
      await storageBridge.backupDisableDynamicMemory();
      
      navigate("/");
    } catch (error) {
      console.error("Failed to restore and disable dynamic memory:", error);
      setError(error instanceof Error ? error.message : "Failed to restore backup");
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.2 }}
      onClick={handleClose}
    >
      <motion.div
        className={cn(
          "w-full max-w-lg border border-white/10 bg-[#0b0b0d] p-6",
          "rounded-t-3xl sm:rounded-3xl sm:mb-8",
          "max-h-[80vh] overflow-hidden flex flex-col",
          shadows.xl
        )}
        initial={{ y: "100%", opacity: 0 }}
        animate={{
          y: isExiting ? "100%" : 0,
          opacity: isExiting ? 0 : 1
        }}
        transition={{
          type: "spring",
          damping: 30,
          stiffness: 350,
          duration: 0.2
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className={cn(typography.h2.size, typography.h2.weight, "text-white")}>
            Restore Backup
          </h3>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {!selectedBackup ? (
            <>
              <div className="flex items-center justify-between">
                <p className={cn(typography.bodySmall.size, "text-white/50")}>
                  Select a backup to restore.
                </p>
                <button
                  onClick={handleBrowseForBackup}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300"
                >
                  Browse Files
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-white/30" />
                </div>
              ) : backups.length === 0 ? (
                <div className={cn("border border-white/10 bg-white/5 p-6 text-center", radius.md)}>
                  <FileArchive className="mx-auto h-8 w-8 text-white/20" />
                  <p className="mt-3 text-sm text-white/40">No backups found</p>
                  <p className="mt-1 text-xs text-white/30">
                    Tap browse to select a .lettuce file
                  </p>
                  <button
                    onClick={handleBrowseForBackup}
                    className={cn(
                      "mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                      "border border-blue-400/30 bg-blue-400/10",
                      "text-sm text-blue-300 font-medium",
                      "hover:bg-blue-400/20 active:scale-[0.98]",
                      interactive.transition.default
                    )}
                  >
                    <Upload className="h-4 w-4" />
                    Browse for .lettuce file
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {backups.map((backup) => (
                    <button
                      key={backup.path}
                      onClick={() => {
                        setSelectedBackup(backup);
                        setIsPickedFile(false);
                        pickedFileDataRef.current = null;
                        setPassword("");
                        setError(null);
                      }}
                      className={cn(
                        "w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left",
                        interactive.transition.default,
                        "hover:border-white/20 hover:bg-white/[0.08]",
                        "active:scale-[0.99]"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10">
                          <FileArchive className="h-4 w-4 text-white/60" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-white">{backup.filename}</p>
                            {backup.encrypted && <Lock className="h-3 w-3 shrink-0 text-amber-400/70" />}
                          </div>
                          <p className="mt-0.5 text-[11px] text-white/40">
                            {formatDate(backup.createdAt)} · v{backup.appVersion}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Selected backup info */}
              <div className={cn("border border-white/10 bg-white/5 p-3", radius.md)}>
                <div className="flex items-center gap-3">
                  <FileArchive className="h-6 w-6 text-white/40" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{selectedBackup.filename}</p>
                    <p className="text-xs text-white/40">
                      {formatDate(selectedBackup.createdAt)} · v{selectedBackup.appVersion}
                    </p>
                  </div>
                </div>
              </div>

              {/* Info notice */}
              <div className={cn(
                "flex items-start gap-2 border border-blue-400/30 bg-blue-400/10 px-3 py-2 text-xs text-blue-200",
                radius.md
              )}>
                <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>This will set up the app with your backed up data, including characters, chats, and settings.</span>
              </div>

              {error && (
                <div className={cn(
                  "flex items-center gap-2 border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200",
                  radius.md
                )}>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {selectedBackup.encrypted && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/50">Backup Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className={cn(
                        "w-full border border-white/10 bg-white/5 px-4 py-3 pr-12 text-white placeholder-white/30",
                        radius.lg,
                        "focus:border-white/20 focus:outline-none"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className={cn("flex flex-col pt-4", spacing.field)}>
          {selectedBackup ? (
            <>
              <button
                onClick={() => void handleRestore()}
                disabled={restoring || (selectedBackup.encrypted && password.length < 1)}
                className={cn(
                  "flex items-center justify-center gap-2 px-6 py-3",
                  radius.md,
                  "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
                  typography.body.size,
                  typography.h3.weight,
                  interactive.transition.fast,
                  interactive.active.scale,
                  "hover:border-emerald-400/60 hover:bg-emerald-400/30",
                  "disabled:opacity-50"
                )}
              >
                {restoring ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Restore Backup
                  </>
                )}
              </button>
              <button
                onClick={() => setSelectedBackup(null)}
                disabled={restoring}
                className={cn(
                  "px-6 py-3",
                  radius.md,
                  "border border-white/10 bg-white/5 text-white/60",
                  typography.body.size,
                  interactive.transition.fast,
                  interactive.active.scale,
                  "hover:border-white/20 hover:bg-white/10 hover:text-white",
                  "disabled:opacity-50"
                )}
              >
                Back
              </button>
            </>
          ) : (
            <button
              onClick={handleClose}
              className={cn(
                "px-6 py-3",
                radius.md,
                "border border-white/10 bg-white/5 text-white/60",
                typography.body.size,
                interactive.transition.fast,
                interactive.active.scale,
                "hover:border-white/20 hover:bg-white/10 hover:text-white"
              )}
            >
              Cancel
            </button>
          )}
        </div>
      </motion.div>

      {/* Dynamic Memory Model Required Modal */}
      {showEmbeddingPrompt && (
        <motion.div
          className="absolute inset-0 z-10 flex items-end justify-center bg-black/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            className={cn(
              "w-full max-w-lg border border-white/10 bg-[#0b0b0d] p-6",
              "rounded-t-3xl",
              shadows.xl
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={cn(typography.h2.size, typography.h2.weight, "text-white mb-4")}>
              Embedding Model Required
            </h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
                <HardDrive className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-amber-200">Dynamic Memory Detected</p>
                  <p className="mt-1 text-xs text-amber-200/70">
                    This backup contains characters with dynamic memory enabled, which requires the embedding model (~260MB).
                  </p>
                </div>
              </div>

              <p className="text-sm text-white/60">
                You can download the model now to enable dynamic memory, or continue without it (dynamic memory will be disabled for affected characters).
              </p>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={handleDownloadModel}
                  className={cn(
                    "flex items-center justify-center gap-2 px-6 py-3",
                    radius.md,
                    "border border-blue-400/40 bg-blue-400/20 text-blue-100",
                    typography.body.size,
                    typography.h3.weight,
                    interactive.transition.fast,
                    "hover:border-blue-400/60 hover:bg-blue-400/30"
                  )}
                >
                  <Download className="h-4 w-4" />
                  Download Model
                </button>
                <button
                  onClick={handleDisableAndContinue}
                  className={cn(
                    "px-6 py-3",
                    radius.md,
                    "border border-white/10 bg-white/5 text-white/60",
                    typography.body.size,
                    interactive.transition.fast,
                    "hover:border-white/20 hover:bg-white/10 hover:text-white"
                  )}
                >
                  Continue Without Dynamic Memory
                </button>
              </div>

              <p className="text-xs text-white/40 text-center">
                You can re-enable dynamic memory later in character settings after downloading the model.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}