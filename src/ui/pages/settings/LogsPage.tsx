import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { FileText, RefreshCw, Trash2, Download, FolderOpen, Loader2, FileCode } from "lucide-react";
import { logManager } from "../../../core/utils/logger";
import { interactive, typography, cn } from "../../design-tokens";

const logger = logManager({ component: "LogsPage" });

export function LogsPage() {
  const [logFiles, setLogFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [logContent, setLogContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [logDir, setLogDir] = useState<string>("");

  const loadLogFiles = async () => {
    try {
      setRefreshing(true);
      const files = await invoke<string[]>("list_log_files");
      setLogFiles(files);
      logger.info("Loaded log files", { count: files.length });
    } catch (err) {
      logger.error("Failed to load log files", err);
    } finally {
      setRefreshing(false);
    }
  };

  const loadLogDir = async () => {
    try {
      const dir = await invoke<string>("get_log_dir_path");
      setLogDir(dir);
    } catch (err) {
      logger.error("Failed to get log directory", err);
    }
  };

  const loadLogContent = async (filename: string) => {
    setLoading(true);
    try {
      const content = await invoke<string>("read_log_file", { filename });
      setLogContent(content);
      setSelectedFile(filename);
      logger.info("Loaded log file", { filename });
    } catch (err) {
      logger.error("Failed to load log file", err);
      setLogContent("Failed to load log file");
    } finally {
      setLoading(false);
    }
  };

  const downloadLogFile = async () => {
    if (!selectedFile) return;
    
    try {
      const savedPath = await invoke<string>("save_log_to_downloads", { filename: selectedFile });
      logger.info("Downloaded log file", { filename: selectedFile, path: savedPath });
      alert(`Log file saved to:\n${savedPath}`);
    } catch (err) {
      logger.error("Failed to download log file", err);
      alert(`Failed to save log file: ${err}`);
    }
  };

  const deleteLogFile = async (filename: string) => {
    try {
      await invoke("delete_log_file", { filename });
      await loadLogFiles();
      if (selectedFile === filename) {
        setSelectedFile(null);
        setLogContent("");
      }
      logger.info("Deleted log file", { filename });
    } catch (err) {
      logger.error("Failed to delete log file", err);
    }
  };

  const clearAllLogs = async () => {
    if (!confirm("Are you sure you want to delete all log files?")) return;
    
    try {
      await invoke("clear_all_logs");
      await loadLogFiles();
      setSelectedFile(null);
      setLogContent("");
      logger.info("Cleared all logs");
    } catch (err) {
      logger.error("Failed to clear all logs", err);
    }
  };

  useEffect(() => {
    loadLogFiles();
    loadLogDir();
  }, []);

  return (
    <div className="flex h-full flex-col pb-16">
      <section className="flex-1 overflow-y-auto px-3 pt-3 space-y-4">
        {/* Log Directory Info */}
        {logDir && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-white/40" />
              <p className={cn(typography.caption.size, "text-white/50 font-mono break-all")}>
                {logDir}
              </p>
            </div>
          </div>
        )}

        {/* Log Files List */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className={cn(
              typography.overline.size,
              typography.overline.weight,
              typography.overline.tracking,
              typography.overline.transform,
              "text-white/35"
            )}>
              Log Files {logFiles.length > 0 && `(${logFiles.length})`}
            </h2>
            <button
              onClick={loadLogFiles}
              disabled={refreshing}
              className={cn(
                typography.caption.size,
                typography.caption.weight,
                "text-blue-400 hover:text-blue-300",
                interactive.transition.default,
                "disabled:opacity-50"
              )}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </button>
          </div>

          {logFiles.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
              <FileCode className="mx-auto h-10 w-10 text-white/20" />
              <p className={cn("mt-3", typography.body.size, "text-white/40")}>
                No log files found
              </p>
              <p className={cn("mt-1", typography.caption.size, "text-white/30")}>
                Logs will appear here as you use the app
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {logFiles.map((file) => (
                <button
                  key={file}
                  onClick={() => loadLogContent(file)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left",
                    interactive.transition.default,
                    selectedFile === file
                      ? "border-blue-400/30 bg-blue-400/10"
                      : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8",
                    interactive.active.scale
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg border",
                        selectedFile === file
                          ? "border-blue-400/30 bg-blue-400/15"
                          : "border-white/10 bg-white/10"
                      )}>
                        <FileText className="h-4 w-4 text-white/60" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn(typography.body.size, typography.body.weight, "text-white truncate")}>
                          {file}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteLogFile(file);
                      }}
                      className={cn(
                        "p-1.5 rounded-lg",
                        "text-red-400/60 hover:text-red-400 hover:bg-red-400/10",
                        interactive.transition.default
                      )}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Log Content Viewer */}
        {selectedFile && (
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className={cn(
                typography.overline.size,
                typography.overline.weight,
                typography.overline.tracking,
                typography.overline.transform,
                "text-white/35"
              )}>
                {selectedFile}
              </h2>
              <button
                onClick={downloadLogFile}
                disabled={!logContent || loading}
                className={cn(
                  typography.caption.size,
                  typography.caption.weight,
                  "text-blue-400 hover:text-blue-300",
                  interactive.transition.default,
                  "disabled:opacity-50 flex items-center gap-1"
                )}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-white/30" />
                </div>
              ) : (
                <div className="max-h-100 overflow-y-auto">
                  <pre className={cn(
                    typography.caption.size,
                    "font-mono p-4 text-white/70 whitespace-pre-wrap wrap-break-word"
                  )}>
                    {logContent || "Log file is empty"}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Clear All Logs */}
        {logFiles.length > 0 && (
          <div>
            <h2 className={cn(
              "mb-2 px-1",
              typography.overline.size,
              typography.overline.weight,
              typography.overline.tracking,
              typography.overline.transform,
              "text-white/35"
            )}>
              Danger Zone
            </h2>
            <button
              onClick={clearAllLogs}
              className={cn(
                "w-full rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-left",
                interactive.transition.default,
                "hover:border-red-400/50 hover:bg-red-400/15",
                interactive.active.scale
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-400/30 bg-red-400/15">
                  <Trash2 className="h-5 w-5 text-red-300" />
                </div>
                <div className="flex-1">
                  <p className={cn(typography.body.size, typography.body.weight, "text-white")}>
                    Clear All Logs
                  </p>
                  <p className={cn(typography.caption.size, "text-white/50")}>
                    Delete all log files permanently
                  </p>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Info */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className={cn(typography.body.size, typography.body.weight, "text-white mb-2")}>
            About Application Logs
          </h3>
          <div className={cn(typography.caption.size, "text-white/50 space-y-1.5")}>
            <p>• Log files are organized by date (app-YYYY-MM-DD.log)</p>
            <p>• Each entry includes timestamp, component, log level, and message</p>
            <p>• Useful for debugging issues and understanding app behavior</p>
            <p>• Sensitive information like API keys are never logged</p>
            <p>• Old log files can be safely deleted to free up space</p>
          </div>
        </div>
      </section>
    </div>
  );
}
