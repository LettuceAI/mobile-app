import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, RefreshCw, Check, X, ChevronDown } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";

import { BottomMenu } from "../BottomMenu";
import { cn, typography, radius, interactive } from "../../design-tokens";
import {
  generateImage,
  type ImageGenerationRequest,
  type GeneratedImage,
} from "../../../core/image-generation";
import { readSettings } from "../../../core/storage/repo";
import type { Model, ProviderCredential } from "../../../core/storage/schemas";

interface AvatarGenerationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onImageGenerated: (imageDataUrl: string) => void;
}

export function AvatarGenerationSheet({
  isOpen,
  onClose,
  onImageGenerated,
}: AvatarGenerationSheetProps) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);

  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderCredential | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      try {
        setLoading(true);
        const settings = await readSettings();
        const imageModels = settings.models.filter(
          (m) => m.modelType === "imagegeneration"
        );
        const providerCreds = settings.providerCredentials;

        setModels(imageModels);
        setProviders(providerCreds);

        const firstModel = imageModels[0] ?? null;
        const provider = firstModel
          ? providerCreds.find(
              (p) =>
                p.providerId === firstModel.providerId &&
                p.label === firstModel.providerLabel
            ) ?? providerCreds.find((p) => p.providerId === firstModel.providerId) ?? null
          : null;

        setSelectedModel(firstModel);
        setSelectedProvider(provider);
      } catch (err) {
        console.error("Failed to load models:", err);
        setError("Failed to load image generation models");
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setPrompt("");
      setGeneratedImage(null);
      setError(null);
    }
  }, [isOpen]);

  const handleModelSelect = useCallback(
    (model: Model) => {
      const provider =
        providers.find(
          (p) => p.providerId === model.providerId && p.label === model.providerLabel
        ) ?? providers.find((p) => p.providerId === model.providerId) ?? null;

      setSelectedModel(model);
      setSelectedProvider(provider);
      setShowModelPicker(false);
    },
    [providers]
  );

  const handleGenerate = useCallback(async () => {
    if (!selectedModel || !selectedProvider || !prompt.trim()) return;

    setGenerating(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const request: ImageGenerationRequest = {
        prompt: `Portrait avatar: ${prompt.trim()}. High quality, centered face, suitable for profile picture.`,
        model: selectedModel.name,
        providerId: selectedModel.providerId,
        credentialId: selectedProvider.id,
        size: "1024x1024",
        n: 1,
      };

      const response = await generateImage(request);

      if (response.images.length > 0) {
        setGeneratedImage(response.images[0]);
      }
    } catch (err) {
      console.error("Image generation failed:", err);
      setError(err instanceof Error ? err.message : "Failed to generate image");
    } finally {
      setGenerating(false);
    }
  }, [selectedModel, selectedProvider, prompt]);

  const handleUseImage = useCallback(async () => {
    if (!generatedImage) return;

    const imageSrc = generatedImage.url || (generatedImage.filePath ? convertFileSrc(generatedImage.filePath) : null);
    
    if (imageSrc) {
      try {
        const response = await fetch(imageSrc);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          onImageGenerated(dataUrl);
          onClose();
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.warn("Failed to convert to data URL, using original:", err);
        onImageGenerated(imageSrc);
        onClose();
      }
    }
  }, [generatedImage, onImageGenerated, onClose]);

  const handleRegenerate = useCallback(() => {
    setGeneratedImage(null);
    handleGenerate();
  }, [handleGenerate]);

  const getImageSrc = useCallback(() => {
    if (!generatedImage) return null;
    return generatedImage.url || (generatedImage.filePath ? convertFileSrc(generatedImage.filePath) : null);
  }, [generatedImage]);

  if (loading && isOpen) {
    return (
      <BottomMenu isOpen={isOpen} onClose={onClose} title="Generate Avatar">
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
        </div>
      </BottomMenu>
    );
  }

  return (
    <BottomMenu isOpen={isOpen} onClose={onClose} title="Generate Avatar">
      <div className="space-y-4">
        {/* Model Selector */}
        <div className="space-y-2">
          <label className={cn(typography.label.size, typography.label.weight, "text-white/60")}>
            Model
          </label>
          <div className="relative">
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className={cn(
                "flex w-full items-center justify-between gap-2 border border-white/10 bg-white/5 px-4 py-3",
                radius.md,
                interactive.transition.default,
                "hover:border-white/20 hover:bg-white/8 active:scale-[0.99]"
              )}
            >
              <span className={cn(typography.body.size, "text-white truncate")}>
                {selectedModel?.displayName || selectedModel?.name || "Select a model"}
              </span>
              <ChevronDown
                size={18}
                className={cn("text-white/50 transition-transform", showModelPicker && "rotate-180")}
              />
            </button>

            <AnimatePresence>
              {showModelPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className={cn(
                    "absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto",
                    "border border-white/10 bg-[#0a0a0c]/95 backdrop-blur-xl",
                    radius.md
                  )}
                >
                  {models.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => handleModelSelect(model)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left",
                        interactive.transition.default,
                        "hover:bg-white/5",
                        model.id === selectedModel?.id && "bg-emerald-500/10"
                      )}
                    >
                      <div className="flex-1 truncate">
                        <p className={cn(typography.body.size, "text-white")}>
                          {model.displayName || model.name}
                        </p>
                        <p className="text-xs text-white/40">{model.providerId}</p>
                      </div>
                      {model.id === selectedModel?.id && (
                        <Check size={16} className="text-emerald-400" />
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Prompt Input */}
        <div className="space-y-2">
          <label className={cn(typography.label.size, typography.label.weight, "text-white/60")}>
            Describe your avatar
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A friendly anime girl with colorful hair, smiling warmly..."
            rows={3}
            className={cn(
              "w-full resize-none border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/30",
              radius.md,
              typography.body.size,
              interactive.transition.default,
              "focus:border-emerald-400/40 focus:bg-black/30 focus:outline-none"
            )}
          />
        </div>

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                "flex items-start gap-3 border border-red-400/30 bg-red-400/10 px-4 py-3",
                radius.md
              )}
            >
              <X className="h-5 w-5 shrink-0 text-red-400" />
              <p className="text-sm text-red-200">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Generated Image Preview */}
        <AnimatePresence mode="wait">
          {generating ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                "flex aspect-square w-full flex-col items-center justify-center gap-3 border border-white/10 bg-white/5 rounded-xl"
              )}
            >
              <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
              <p className={cn(typography.body.size, "text-white/50")}>Generating avatar...</p>
            </motion.div>
          ) : generatedImage ? (
            <motion.div
              key="image"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative"
            >
              <div
                className={cn(
                  "relative aspect-square w-full overflow-hidden border border-emerald-400/30 rounded-xl"
                )}
              >
                <img
                  src={getImageSrc() || ""}
                  alt="Generated avatar"
                  className="h-full w-full object-cover"
                />
              </div>

              {/* Action buttons over image */}
              <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                <button
                  onClick={handleRegenerate}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 border border-white/20 bg-black/60 py-2.5 backdrop-blur-sm",
                    radius.md,
                    interactive.transition.default,
                    "hover:bg-black/70 active:scale-[0.98]"
                  )}
                >
                  <RefreshCw size={16} className="text-white/70" />
                  <span className="text-sm font-medium text-white">Regenerate</span>
                </button>
                <button
                  onClick={handleUseImage}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 border border-emerald-400/40 bg-emerald-500/80 py-2.5",
                    radius.md,
                    interactive.transition.default,
                    "hover:bg-emerald-500/90 active:scale-[0.98]"
                  )}
                >
                  <Check size={16} className="text-white" />
                  <span className="text-sm font-semibold text-white">Use This</span>
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Generate Button (only show when no image) */}
        {!generatedImage && !generating && (
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || !selectedModel}
            className={cn(
              "flex w-full items-center justify-center gap-2 py-4",
              radius.md,
              interactive.transition.fast,
              prompt.trim() && selectedModel
                ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-100 active:bg-emerald-500/30"
                : "cursor-not-allowed border border-white/5 bg-white/5 text-white/30"
            )}
          >
            <Sparkles size={18} />
            <span className="font-semibold">Generate Avatar</span>
          </button>
        )}
      </div>
    </BottomMenu>
  );
}
