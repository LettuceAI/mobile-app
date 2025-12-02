import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ImageIcon, Crop } from "lucide-react";
import { useRef, useEffect } from "react";
import { cn } from "../../design-tokens";

interface AvatarSourceMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerateImage: () => void;
  onChooseImage: () => void;
  onEditCurrent?: () => void;
  hasImageGenerationModels: boolean;
  hasCurrentAvatar?: boolean;
}

export function AvatarSourceMenu({
  isOpen,
  onClose,
  onGenerateImage,
  onChooseImage,
  onEditCurrent,
  hasImageGenerationModels,
  hasCurrentAvatar = false,
}: AvatarSourceMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[90]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Menu */}
          <motion.div
            ref={menuRef}
            className={cn(
              "absolute z-[100] w-56 overflow-hidden rounded-2xl",
              "border border-white/15 bg-[#0f1014]/95 backdrop-blur-xl",
              "shadow-xl shadow-black/40",
              "left-0 top-full mt-2"
            )}
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -8 }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
          >
            <div className="p-1.5">
              {/* Generate Image Option */}
              <button
                onClick={() => {
                  if (hasImageGenerationModels) {
                    onGenerateImage();
                    onClose();
                  }
                }}
                disabled={!hasImageGenerationModels}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
                  hasImageGenerationModels
                    ? "hover:bg-emerald-500/15 active:bg-emerald-500/25"
                    : "cursor-not-allowed opacity-50"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    "border border-emerald-400/30 bg-emerald-500/15",
                    hasImageGenerationModels
                      ? "text-emerald-300 group-hover:border-emerald-400/50 group-hover:text-emerald-200"
                      : "text-emerald-400/50"
                  )}
                >
                  <Sparkles size={18} />
                </div>
                <div className="flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      hasImageGenerationModels ? "text-white" : "text-white/50"
                    )}
                  >
                    Generate Image
                  </p>
                  <p className="text-[11px] text-white/40">
                    {hasImageGenerationModels
                      ? "AI-powered avatar creation"
                      : "No image models available"}
                  </p>
                </div>
              </button>

              {/* Divider */}
              <div className="mx-2 my-1 border-t border-white/10" />

              {/* Edit Current Image Option */}
              {hasCurrentAvatar && onEditCurrent && (
                <>
                  <button
                    onClick={() => {
                      onEditCurrent();
                      onClose();
                    }}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
                      "hover:bg-amber-500/15 active:bg-amber-500/25"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg",
                        "border border-amber-400/30 bg-amber-500/15 text-amber-300",
                        "group-hover:border-amber-400/50 group-hover:text-amber-200"
                      )}
                    >
                      <Crop size={18} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">Edit Current</p>
                      <p className="text-[11px] text-white/40">Reposition or crop</p>
                    </div>
                  </button>

                  {/* Divider */}
                  <div className="mx-2 my-1 border-t border-white/10" />
                </>
              )}

              {/* Choose Image Option */}
              <button
                onClick={() => {
                  onChooseImage();
                  onClose();
                }}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
                  "hover:bg-blue-500/15 active:bg-blue-500/25"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    "border border-blue-400/30 bg-blue-500/15 text-blue-300",
                    "group-hover:border-blue-400/50 group-hover:text-blue-200"
                  )}
                >
                  <ImageIcon size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Choose Image</p>
                  <p className="text-[11px] text-white/40">Select from your device</p>
                </div>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
