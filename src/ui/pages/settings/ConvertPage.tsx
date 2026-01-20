import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, FileCode, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { cn, typography, radius, interactive } from "../../design-tokens";
import { convertImportToUec } from "../../../core/storage/genericTransfer";
import {
  readFileAsText,
  downloadJson,
  generateExportFilename as generateCharacterFilename,
} from "../../../core/storage/characterTransfer";
import { generateExportFilename as generatePersonaFilename } from "../../../core/storage/personaTransfer";
import { toast } from "../../components/toast";

type UecKind = "character" | "persona";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function ConvertPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertedFilename, setConvertedFilename] = useState<string | null>(null);
  const [convertedKind, setConvertedKind] = useState<UecKind | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setConvertedFilename(null);
    setConvertedKind(null);
    event.target.value = "";
  };

  const handleConvert = async () => {
    if (!selectedFile || converting) return;
    try {
      setConverting(true);
      const contents = await readFileAsText(selectedFile);
      const converted = await convertImportToUec(contents);
      const parsed = JSON.parse(converted) as { kind?: string; payload?: Record<string, any> };
      const kind = parsed.kind === "persona" ? "persona" : "character";
      const title =
        kind === "persona" ? (parsed.payload?.title ?? "") : (parsed.payload?.name ?? "");
      const baseName = selectedFile.name.replace(/\.[^.]+$/, "") || kind;
      const filename =
        kind === "persona"
          ? generatePersonaFilename(title || baseName)
          : generateCharacterFilename(title || baseName);

      await downloadJson(converted, filename);
      setConvertedFilename(filename);
      setConvertedKind(kind);
      toast.success("Conversion complete", `Saved ${filename}`);
    } catch (error: any) {
      console.error("Failed to convert file:", error);
      toast.error("Conversion failed", error?.message || "Unable to convert this file");
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="flex h-full flex-col pb-16 text-gray-200">
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="space-y-4"
        >
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/15">
                <FileCode className="h-4 w-4 text-amber-200" />
              </div>
              <div>
                <h2 className={cn(typography.body.size, "font-semibold text-amber-100")}>
                  Convert legacy exports
                </h2>
                <p className={cn(typography.caption.size, "mt-1 text-amber-100/70")}>
                  JSON exports are deprecated. Convert them to Unified Entity Card (UEC) files for
                  future compatibility.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={cn(typography.body.size, "text-white font-medium")}>
                  Choose a file
                </h3>
                <p className={cn(typography.caption.size, "text-white/50")}>
                  Supports legacy .json exports and existing Unified Entity Card (UEC) files.
                </p>
              </div>
              <label
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2",
                  radius.md,
                  "border border-blue-400/40 bg-blue-400/15 text-blue-100",
                  interactive.transition.default,
                  "hover:border-blue-400/60 hover:bg-blue-400/25",
                )}
              >
                <Upload className="h-4 w-4" />
                Browse
                <input
                  type="file"
                  accept="application/json,.json,.uec"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {selectedFile ? (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <div className="min-w-0">
                  <p className={cn(typography.caption.size, "truncate text-white/70")}>
                    {selectedFile.name}
                  </p>
                  <p className={cn(typography.caption.size, "text-white/35")}>
                    {formatBytes(selectedFile.size)}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                  {selectedFile.name.toLowerCase().endsWith(".json")
                    ? "JSON"
                    : "Unified Entity Card (UEC)"}
                </span>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-6 text-center">
                <p className={cn(typography.caption.size, "text-white/40")}>No file selected yet</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
            <button
              onClick={handleConvert}
              disabled={!selectedFile || converting}
              className={cn(
                "flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold",
                radius.md,
                interactive.transition.default,
                "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
                "hover:border-emerald-400/60 hover:bg-emerald-400/30",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {converting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4" />
                  Convert to Unified Entity Card (UEC)
                </>
              )}
            </button>

            {convertedFilename && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                <p className={cn(typography.caption.size, "text-emerald-100/80")}>
                  Saved {convertedKind} as {convertedFilename}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
